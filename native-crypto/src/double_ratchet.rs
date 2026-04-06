//! Double Ratchet Algorithm (Signal specification).
//!
//! Bootstrap protocol:
//!
//!   Shared secret S is produced by PQXDH before session creation.
//!   alice_key / bob_key are freshly-generated X25519 ratchet key pairs.
//!
//!   Initiator (Alice):
//!     dhr_key       = alice_key  (advertised in first outgoing header)
//!     (RK, send_ck) = KDF_RK(S, DH(alice_key, bob_pub))
//!
//!   Responder (Bob):
//!     dhr_key                 = fresh (used for Bob's first send)
//!     dhr_remote              = alice_pub  (matches Alice's first header)
//!     (RK, recv_ck)           = KDF_RK(S, DH(bob_key, alice_pub))
//!
//!   The two KDF_RK computations are symmetric (DH is commutative), so
//!   Alice's send_ck == Bob's recv_ck and both parties share the same RK.
//!
//!   When Bob sends his first message he calls ratchet_send_only which
//!   derives a send chain from DH(bob_fresh_key, alice_pub).  Alice, upon
//!   receiving that message, fires dh_ratchet normally.

use std::collections::BTreeMap;
use x25519_dalek::{StaticSecret, PublicKey};
use rand::rngs::OsRng;
use zeroize::{Zeroizing, ZeroizeOnDrop};

use crate::errors::CryptoError;
use crate::Result;

const MAX_SKIP: u32 = 1000;
const MAX_SKIPPED_TOTAL: usize = 2000;
const HKDF_INFO_ROOT: &[u8] = b"ephchat-root-ratchet";
const HKDF_INFO_CHAIN: &[u8] = b"ephchat-chain-ratchet";

// --------------------------------------------------------------------------
// RatchetKey
// --------------------------------------------------------------------------

#[derive(ZeroizeOnDrop)]
pub struct RatchetKey {
    secret: StaticSecret,
}

impl RatchetKey {
    pub fn generate() -> Result<Self> {
        Ok(RatchetKey { secret: StaticSecret::random_from_rng(OsRng) })
    }

    /// Reconstruct a RatchetKey from raw secret bytes.
    /// `bytes` is consumed by moving into `StaticSecret`; the stack copy is
    /// zeroized by the caller (use `Zeroizing` at the call site).
    fn from_secret_bytes(bytes: [u8; 32]) -> Self {
        RatchetKey { secret: StaticSecret::from(bytes) }
    }

    /// Extract raw secret bytes wrapped in `Zeroizing` so the copy on the
    /// stack is overwritten when the returned value is dropped.
    fn to_secret_bytes(&self) -> Zeroizing<[u8; 32]> {
        Zeroizing::new(self.secret.to_bytes())
    }

    pub fn public(&self) -> PublicKey {
        PublicKey::from(&self.secret)
    }

    fn dh(&self, their_public: &PublicKey) -> Zeroizing<[u8; 32]> {
        Zeroizing::new(self.secret.diffie_hellman(their_public).to_bytes())
    }
}

// --------------------------------------------------------------------------
// MessageHeader
// --------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct MessageHeader {
    /// Sender's current ratchet public key.
    pub dh_public: [u8; 32],
    /// Number of messages in the previous sending chain.
    pub pn: u32,
    /// Message number in the current sending chain.
    pub n: u32,
}

// --------------------------------------------------------------------------
// KDF helpers
// --------------------------------------------------------------------------

/// Root-key ratchet: HKDF(salt=root_key, IKM=dh_output) → (new_rk, new_ck)
fn kdf_rk(root_key: &[u8; 32], dh_output: &[u8; 32]) -> Result<([u8; 32], [u8; 32])> {
    let deriver = crate::hkdf::HKDFDeriver::new(dh_output, Some(root_key));
    let mut combined = [0u8; 64];
    deriver.derive_var(HKDF_INFO_ROOT, &mut combined)?;
    let mut rk = [0u8; 32];
    let mut ck = [0u8; 32];
    rk.copy_from_slice(&combined[..32]);
    ck.copy_from_slice(&combined[32..]);
    Ok((rk, ck))
}

/// Chain-key step: HKDF(IKM=chain_key) → (new_ck, message_key)
fn kdf_ck(chain_key: &[u8; 32]) -> Result<([u8; 32], [u8; 32])> {
    let deriver = crate::hkdf::HKDFDeriver::new(chain_key, None);
    let mut combined = [0u8; 64];
    deriver.derive_var(HKDF_INFO_CHAIN, &mut combined)?;
    let mut new_ck = [0u8; 32];
    let mut mk = [0u8; 32];
    new_ck.copy_from_slice(&combined[..32]);
    mk.copy_from_slice(&combined[32..]);
    Ok((new_ck, mk))
}

// --------------------------------------------------------------------------
// AES-GCM helpers
// --------------------------------------------------------------------------

fn encrypt_with_key(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    let aes_key = crate::aes_gcm::AESGCMKey::from_bytes(key)?;
    aes_key.encrypt(plaintext, aad)
}

fn decrypt_with_key(key: &[u8; 32], ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    let aes_key = crate::aes_gcm::AESGCMKey::from_bytes(key)?;
    aes_key.decrypt(ciphertext, aad)
}

// --------------------------------------------------------------------------
// DoubleRatchetSession
// --------------------------------------------------------------------------

pub struct DoubleRatchetSession {
    // DH ratchet state
    dhr_key: RatchetKey,       // our current ratchet key pair
    dhr_remote: PublicKey,     // remote's latest ratchet public key

    // Root and chain keys (zeroed on drop)
    root_key: Zeroizing<[u8; 32]>,
    send_chain_key: Zeroizing<[u8; 32]>,
    recv_chain_key: Zeroizing<[u8; 32]>,

    // Message counters
    send_n: u32,       // next outgoing message number
    recv_n: u32,       // next expected incoming message number
    prev_send_n: u32,  // length of previous sending chain (PN in headers)

    // Skipped message key cache: (dh_public_bytes, msg_n) → message_key
    skipped: BTreeMap<([u8; 32], u32), [u8; 32]>,

    /// Public compat field: mirrors send_chain_key as Vec<u8>.
    pub sending_chain_key: Zeroizing<Vec<u8>>,
}

impl DoubleRatchetSession {
    // -----------------------------------------------------------------------
    // Constructors
    // -----------------------------------------------------------------------

    /// Create a session for the *initiating* party (Alice).
    ///
    /// `my_key` is Alice's initial ratchet key pair. Its public key is
    /// advertised in the first outgoing message header, allowing Bob to
    /// match it against his pre-computed `dhr_remote`.
    ///
    ///   (RK, send_ck) = KDF_RK(shared, DH(my_key, peer_pub))
    pub fn new_initiator(shared: &[u8; 32], my_key: &RatchetKey, peer_pub: &PublicKey) -> Result<Self> {
        let dh_out = my_key.dh(peer_pub);
        let (root_key, send_chain_key) = kdf_rk(shared, &*dh_out)?;

        // Copy my_key into the session so dhr_key.public() == my_key.public().
        // to_secret_bytes() returns Zeroizing<[u8;32]> so the intermediate copy is wiped.
        let session_dhr = RatchetKey::from_secret_bytes(*my_key.to_secret_bytes());

        Ok(DoubleRatchetSession {
            dhr_key: session_dhr,
            dhr_remote: *peer_pub,
            root_key: Zeroizing::new(root_key),
            send_chain_key: Zeroizing::new(send_chain_key),
            recv_chain_key: Zeroizing::new([0u8; 32]),
            send_n: 0,
            recv_n: 0,
            prev_send_n: 0,
            skipped: BTreeMap::new(),
            sending_chain_key: Zeroizing::new(send_chain_key.to_vec()),
        })
    }

    /// Create a session for the *responding* party (Bob).
    ///
    /// `my_key` is Bob's ratchet key pair (its public key was shared with Alice
    /// beforehand via the key bundle). `peer_pub` is Alice's initial ratchet
    /// public key — this matches the first header Alice sends.
    ///
    ///   (RK, recv_ck) = KDF_RK(shared, DH(my_key, peer_pub))
    ///
    /// The first incoming message from Alice carries `peer_pub` as its header
    /// DH key, so `dhr_remote == header.dh_public` and no DH ratchet fires;
    /// the pre-computed `recv_ck` is used directly.
    ///
    /// Bob's `send_chain_key` starts as zeros. On the first call to `encrypt`,
    /// `ratchet_send_only` fires to bootstrap a sending chain from
    /// `DH(bob_fresh_key, alice_pub)`.
    pub fn new_responder(shared: &[u8; 32], my_key: &RatchetKey, peer_pub: &PublicKey) -> Result<Self> {
        let dh_out = my_key.dh(peer_pub);
        let (root_key, recv_chain_key) = kdf_rk(shared, &*dh_out)?;

        // Fresh ratchet key for Bob's first send (its public will appear in Bob's headers).
        let session_dhr = RatchetKey::generate()?;

        Ok(DoubleRatchetSession {
            dhr_key: session_dhr,
            dhr_remote: *peer_pub,     // Alice's initial pub — matches her first header
            root_key: Zeroizing::new(root_key),
            send_chain_key: Zeroizing::new([0u8; 32]),   // bootstrapped on first encrypt
            recv_chain_key: Zeroizing::new(recv_chain_key),
            send_n: 0,
            recv_n: 0,
            prev_send_n: 0,
            skipped: BTreeMap::new(),
            sending_chain_key: Zeroizing::new(vec![0u8; 32]),
        })
    }

    // -----------------------------------------------------------------------
    // Encrypt
    // -----------------------------------------------------------------------

    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>> {
        // Responder's first send: bootstrap the sending chain.
        if *self.send_chain_key == [0u8; 32] {
            let remote = self.dhr_remote;
            self.ratchet_send_only(&remote)?;
        }

        // Advance send chain key → message key.
        let (new_ck, mk) = kdf_ck(&self.send_chain_key)?;
        *self.send_chain_key = new_ck;

        let header = MessageHeader {
            dh_public: self.dhr_key.public().to_bytes(),
            pn: self.prev_send_n,
            n: self.send_n,
        };
        self.send_n += 1;

        let header_bytes = serde_json::to_vec(&header)
            .map_err(|e| CryptoError::SerializationError(e.to_string()))?;

        let ciphertext = encrypt_with_key(&mk, plaintext, &header_bytes)?;

        // Wire format: [ 4-byte LE header_len | header_bytes | ciphertext ]
        let mut out = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        out.extend_from_slice(&(header_bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(&header_bytes);
        out.extend_from_slice(&ciphertext);

        self.sending_chain_key = Zeroizing::new(self.send_chain_key.to_vec());
        Ok(out)
    }

    // -----------------------------------------------------------------------
    // Decrypt
    // -----------------------------------------------------------------------

    pub fn decrypt(&mut self, message: &[u8]) -> Result<Vec<u8>> {
        if message.len() < 4 {
            return Err(CryptoError::DecryptionFailed);
        }
        let header_len = u32::from_le_bytes(
            message[..4].try_into().map_err(|_| CryptoError::DecryptionFailed)?,
        ) as usize;
        if message.len() < 4 + header_len {
            return Err(CryptoError::DecryptionFailed);
        }
        let header_bytes = &message[4..4 + header_len];
        let ciphertext = &message[4 + header_len..];

        let header: MessageHeader = serde_json::from_slice(header_bytes)
            .map_err(|_| CryptoError::DecryptionFailed)?;
        let dh_pub = PublicKey::from(header.dh_public);

        // Check the skipped-key cache first.
        if let Some(mk) = self.skipped.remove(&(header.dh_public, header.n)) {
            return decrypt_with_key(&mk, ciphertext, header_bytes);
        }

        // New DH key in header → DH ratchet step.
        if dh_pub != self.dhr_remote {
            self.skip_message_keys(header.pn)?;
            self.dh_ratchet(&dh_pub)?;
        }

        // Advance recv chain to message n.
        self.skip_message_keys(header.n)?;

        // Note: replay protection requires the caller to track consumed message numbers.
        // This implementation does not deduplicate decrypted messages.
        let (new_ck, mk) = kdf_ck(&self.recv_chain_key)?;
        *self.recv_chain_key = new_ck;
        self.recv_n += 1;

        decrypt_with_key(&mk, ciphertext, header_bytes)
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Cache message keys for `recv_n..until` so out-of-order messages can be decrypted.
    fn skip_message_keys(&mut self, until: u32) -> Result<()> {
        if self.recv_n.saturating_add(MAX_SKIP) < until {
            return Err(CryptoError::InvalidInput("too many skipped messages".into()));
        }
        // Guard total map size against unbounded growth across ratchet steps
        while self.recv_n < until {
            if self.skipped.len() >= MAX_SKIPPED_TOTAL {
                return Err(CryptoError::InvalidInput("skipped message cache full".into()));
            }
            let (new_ck, mk) = kdf_ck(&self.recv_chain_key)?;
            *self.recv_chain_key = new_ck;
            self.skipped.insert((self.dhr_remote.to_bytes(), self.recv_n), mk);
            self.recv_n += 1;
        }
        Ok(())
    }

    /// Bootstrap a sending chain without touching recv state.
    /// Called by the responder on its first encrypt.
    fn ratchet_send_only(&mut self, remote_pub: &PublicKey) -> Result<()> {
        self.dhr_key = RatchetKey::generate()?;
        let dh_send = self.dhr_key.dh(remote_pub);
        let (new_rk, new_send_ck) = kdf_rk(&self.root_key, &*dh_send)?;
        *self.root_key = new_rk;
        *self.send_chain_key = new_send_ck;
        self.sending_chain_key = Zeroizing::new(self.send_chain_key.to_vec());
        Ok(())
    }

    /// Full DH ratchet step upon receiving a message with a new remote DH key.
    fn dh_ratchet(&mut self, remote_pub: &PublicKey) -> Result<()> {
        self.prev_send_n = self.send_n;
        self.send_n = 0;
        self.recv_n = 0;
        self.dhr_remote = *remote_pub;

        // Receiving step: DH(our current key, their new key) → recv chain
        let dh_recv = self.dhr_key.dh(remote_pub);
        let (new_rk, new_recv_ck) = kdf_rk(&self.root_key, &*dh_recv)?;
        *self.root_key = new_rk;
        *self.recv_chain_key = new_recv_ck;

        // Generate a fresh sending key pair.
        self.dhr_key = RatchetKey::generate()?;

        // Sending step: DH(new key, their new key) → send chain
        let dh_send = self.dhr_key.dh(remote_pub);
        let (new_rk2, new_send_ck) = kdf_rk(&self.root_key, &*dh_send)?;
        *self.root_key = new_rk2;
        *self.send_chain_key = new_send_ck;

        self.sending_chain_key = Zeroizing::new(self.send_chain_key.to_vec());
        Ok(())
    }
}
