//! PQXDH: Hybrid X25519 + ML-KEM-768 Post-Quantum Extended Diffie-Hellman.
//!
//! Implements a Signal-inspired PQXDH key exchange:
//! 1. X25519 DH between initiator ephemeral key and responder signed/ephemeral prekeys.
//! 2. ML-KEM-768 encapsulation against the responder's KEM public key.
//! 3. HKDF-SHA256 over (DH1 || DH2 || KEM_SS) to produce a 32-byte shared secret.
//!
//! The responder's signed prekey is verified by Ed25519 before use. Secrets are
//! zeroed on drop via `zeroize`.

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey, Verifier};
use ml_kem::{
    Decapsulate, Encapsulate, Kem, KeyExport, MlKem768,
    kem::{DecapsulationKey, EncapsulationKey},
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret};
use zeroize::Zeroize;

use crate::errors::CryptoError;
use crate::Result;

// ──────────────────────────────────────────────────────────────────────────────
// Public bundle
// ──────────────────────────────────────────────────────────────────────────────

/// The responder's public key bundle sent to the initiator before the handshake.
#[derive(Clone, Serialize, Deserialize)]
pub struct PQXDHPublicBundle {
    /// Ed25519 identity verifying key (32 bytes).
    pub identity_key: [u8; 32],
    /// X25519 signed prekey public (32 bytes).
    pub signed_prekey: [u8; 32],
    /// Ed25519 signature over `signed_prekey` (64 bytes).
    #[serde(with = "serde_bytes_64")]
    pub signed_prekey_signature: [u8; 64],
    /// X25519 one-time ephemeral prekey public (32 bytes).
    pub ephemeral_prekey: [u8; 32],
    /// ML-KEM-768 encapsulation key bytes (1184 bytes), stored as Vec for serde simplicity.
    pub kem_public_key: Vec<u8>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Responder
// ──────────────────────────────────────────────────────────────────────────────

/// The responder (Bob) side of the PQXDH handshake.
///
/// Generates all key material and produces the public bundle. After the
/// initiator sends an initial message, call [`receive_initial_message`] to
/// derive the shared secret.
pub struct PQXDHResponder {
    signed_prekey_secret: StaticSecret,
    ephemeral_prekey_secret: StaticSecret,
    kem_decap_key: DecapsulationKey<MlKem768>,
    bundle: PQXDHPublicBundle,
}

// Zeroize secrets on drop manually (StaticSecret already zeroizes; we cover the
// rest explicitly).
impl Drop for PQXDHResponder {
    fn drop(&mut self) {
        // StaticSecret implements ZeroizeOnDrop internally.
        // kem_decap_key's inner state is zeroized by ml-kem when the "zeroize"
        // feature is enabled; if not, we at least clear the bundle fields.
        self.bundle.signed_prekey.zeroize();
        self.bundle.ephemeral_prekey.zeroize();
        self.bundle.kem_public_key.zeroize();
    }
}

impl PQXDHResponder {
    /// Generate a fresh responder bundle.
    pub fn generate() -> Result<Self> {
        // Ed25519 identity signing key.
        let identity_signing_key = SigningKey::generate(&mut OsRng);

        // X25519 signed prekey.
        let signed_prekey_secret = StaticSecret::random_from_rng(OsRng);
        let signed_prekey_pub = X25519PublicKey::from(&signed_prekey_secret);

        // Ed25519 signature over the signed prekey bytes.
        let sig: Signature = identity_signing_key.sign(signed_prekey_pub.as_bytes());

        // X25519 one-time ephemeral prekey.
        let ephemeral_prekey_secret = StaticSecret::random_from_rng(OsRng);
        let ephemeral_prekey_pub = X25519PublicKey::from(&ephemeral_prekey_secret);

        // ML-KEM-768 keypair: returns (DecapsulationKey, EncapsulationKey).
        let (kem_decap_key, kem_encap_key) = MlKem768::generate_keypair();

        // Serialize the encapsulation key (1184 bytes for ML-KEM-768).
        let kem_encap_bytes: Vec<u8> = kem_encap_key.to_bytes().to_vec();

        let bundle = PQXDHPublicBundle {
            identity_key: identity_signing_key.verifying_key().to_bytes(),
            signed_prekey: *signed_prekey_pub.as_bytes(),
            signed_prekey_signature: sig.to_bytes(),
            ephemeral_prekey: *ephemeral_prekey_pub.as_bytes(),
            kem_public_key: kem_encap_bytes,
        };

        Ok(PQXDHResponder {
            signed_prekey_secret,
            ephemeral_prekey_secret,
            kem_decap_key,
            bundle,
        })
    }

    /// Return the public bundle to share with the initiator.
    pub fn public_bundle(&self) -> PQXDHPublicBundle {
        self.bundle.clone()
    }

    /// Derive the shared secret from the initiator's initial message.
    ///
    /// The message format is: `[32 B X25519 ephemeral pub || 1088 B ML-KEM-768 ciphertext]`.
    pub fn receive_initial_message(&self, initiator_message: &[u8]) -> Result<[u8; 32]> {
        const X25519_PUB_LEN: usize = 32;
        const KEM_CT_LEN: usize = 1088;
        const EXPECTED: usize = X25519_PUB_LEN + KEM_CT_LEN;

        if initiator_message.len() < EXPECTED {
            return Err(CryptoError::InvalidInput(format!(
                "initiator message too short: expected {EXPECTED} bytes, got {}",
                initiator_message.len()
            )));
        }

        // Parse initiator ephemeral X25519 public key.
        let ephem_bytes: [u8; 32] = initiator_message[..32].try_into().map_err(|_| {
            CryptoError::InvalidInput("failed to parse initiator ephemeral key".into())
        })?;
        let initiator_ephem_pub = X25519PublicKey::from(ephem_bytes);

        // X25519 DH operations.
        let dh1 = self
            .signed_prekey_secret
            .diffie_hellman(&initiator_ephem_pub)
            .to_bytes();
        let dh2 = self
            .ephemeral_prekey_secret
            .diffie_hellman(&initiator_ephem_pub)
            .to_bytes();

        // ML-KEM-768 decapsulation.
        let kem_ct_bytes = &initiator_message[X25519_PUB_LEN..EXPECTED];
        let kem_ss = decapsulate_kem768(&self.kem_decap_key, kem_ct_bytes)?;

        combine_secrets(&dh1, &dh2, &kem_ss)
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Initiator
// ──────────────────────────────────────────────────────────────────────────────

/// The initiator (Alice) side of the PQXDH handshake.
///
/// Validates the responder's bundle, encapsulates the ML-KEM shared secret,
/// and constructs the initial message to send.
pub struct PQXDHInitiator {
    ephemeral_secret: StaticSecret,
    kem_ciphertext: Vec<u8>,
    kem_shared_secret: Vec<u8>,
    bundle: PQXDHPublicBundle,
}

impl Drop for PQXDHInitiator {
    fn drop(&mut self) {
        self.kem_shared_secret.zeroize();
        self.kem_ciphertext.zeroize();
    }
}

impl PQXDHInitiator {
    /// Create a new initiator, verifying the bundle's prekey signature and
    /// running ML-KEM encapsulation.
    ///
    /// # Errors
    /// Returns `CryptoError::InvalidInput` if:
    /// - The identity key bytes are invalid.
    /// - The signed prekey signature does not verify.
    /// - The KEM encapsulation key is malformed.
    pub fn new(bundle: &PQXDHPublicBundle) -> Result<Self> {
        // Verify the signed prekey's Ed25519 signature.
        let identity_pub = VerifyingKey::from_bytes(&bundle.identity_key)
            .map_err(|_| CryptoError::InvalidInput("invalid Ed25519 identity key".into()))?;

        let sig = Signature::from_bytes(&bundle.signed_prekey_signature);

        identity_pub
            .verify(&bundle.signed_prekey, &sig)
            .map_err(|_| CryptoError::InvalidInput("signed prekey signature is invalid".into()))?;

        // ML-KEM-768 encapsulation.
        let (kem_ct, kem_ss) = encapsulate_kem768(&bundle.kem_public_key)?;

        Ok(PQXDHInitiator {
            ephemeral_secret: StaticSecret::random_from_rng(OsRng),
            kem_ciphertext: kem_ct,
            kem_shared_secret: kem_ss,
            bundle: bundle.clone(),
        })
    }

    /// Compute the shared secret and construct the initial message.
    ///
    /// Returns `(shared_secret: [u8; 32], initial_message: Vec<u8>)` where
    /// `initial_message = [ephemeral_pub (32 B) || ML-KEM-768 ciphertext (1088 B)]`.
    pub fn create_initial_message(&self) -> Result<([u8; 32], Vec<u8>)> {
        let ephem_pub = X25519PublicKey::from(&self.ephemeral_secret);
        let spk_pub = X25519PublicKey::from(self.bundle.signed_prekey);
        let ek_pub = X25519PublicKey::from(self.bundle.ephemeral_prekey);

        let dh1 = self.ephemeral_secret.diffie_hellman(&spk_pub).to_bytes();
        let dh2 = self.ephemeral_secret.diffie_hellman(&ek_pub).to_bytes();

        let shared = combine_secrets(&dh1, &dh2, &self.kem_shared_secret)?;

        // Build the initial message: ephemeral pub || KEM ciphertext.
        let mut msg = Vec::with_capacity(32 + self.kem_ciphertext.len());
        msg.extend_from_slice(ephem_pub.as_bytes());
        msg.extend_from_slice(&self.kem_ciphertext);

        Ok((shared, msg))
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/// HKDF-SHA256 over `DH1 || DH2 || KEM_SS` → 32-byte shared secret.
fn combine_secrets(dh1: &[u8; 32], dh2: &[u8; 32], kem_ss: &[u8]) -> Result<[u8; 32]> {
    let mut ikm = Vec::with_capacity(32 + 32 + kem_ss.len());
    ikm.extend_from_slice(dh1);
    ikm.extend_from_slice(dh2);
    ikm.extend_from_slice(kem_ss);

    let deriver = crate::hkdf::HKDFDeriver::new(&ikm, None);
    deriver.derive::<32>(b"ephchat-pqxdh-v1")
}

/// Parse an ML-KEM-768 encapsulation key from raw bytes and encapsulate a
/// fresh shared secret.
///
/// Returns `(ciphertext_bytes, shared_secret_bytes)`.
fn encapsulate_kem768(ek_bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    // ML-KEM-768 encapsulation key is exactly 1184 bytes.
    const EK_LEN: usize = 1184;
    if ek_bytes.len() != EK_LEN {
        return Err(CryptoError::InvalidInput(format!(
            "ML-KEM-768 encapsulation key must be {EK_LEN} bytes, got {}",
            ek_bytes.len()
        )));
    }

    // hybrid-array Array<u8, U1184> is needed; convert via try_into on the slice.
    let ek_array: &[u8; EK_LEN] = ek_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidInput("KEM encapsulation key conversion failed".into()))?;

    let ek = EncapsulationKey::<MlKem768>::new(ek_array.into())
        .map_err(|_| CryptoError::InvalidInput("invalid ML-KEM-768 encapsulation key".into()))?;

    let (ct, ss) = ek.encapsulate();

    Ok((ct.to_vec(), ss.to_vec()))
}

/// Decapsulate an ML-KEM-768 ciphertext using the stored decapsulation key.
///
/// Returns the 32-byte shared secret as `Vec<u8>`.
fn decapsulate_kem768(
    dk: &DecapsulationKey<MlKem768>,
    ct_bytes: &[u8],
) -> Result<Vec<u8>> {
    // ML-KEM-768 ciphertext is exactly 1088 bytes.
    const CT_LEN: usize = 1088;
    if ct_bytes.len() != CT_LEN {
        return Err(CryptoError::InvalidInput(format!(
            "ML-KEM-768 ciphertext must be {CT_LEN} bytes, got {}",
            ct_bytes.len()
        )));
    }

    let ct_array: &[u8; CT_LEN] = ct_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidInput("KEM ciphertext conversion failed".into()))?;

    let ss = dk.decapsulate(ct_array.into());
    Ok(ss.to_vec())
}

// ──────────────────────────────────────────────────────────────────────────────
// Serde helper for [u8; 64]
// ──────────────────────────────────────────────────────────────────────────────

mod serde_bytes_64 {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(bytes: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_bytes(bytes)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let v = Vec::<u8>::deserialize(d)?;
        v.try_into()
            .map_err(|_| serde::de::Error::custom("expected exactly 64 bytes"))
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pqxdh_roundtrip_unit() {
        let bob = PQXDHResponder::generate().unwrap();
        let bundle = bob.public_bundle();

        let alice = PQXDHInitiator::new(&bundle).unwrap();
        let (alice_shared, initial_msg) = alice.create_initial_message().unwrap();

        let bob_shared = bob.receive_initial_message(&initial_msg).unwrap();

        assert_eq!(alice_shared, bob_shared, "shared secrets must match");
    }

    #[test]
    fn test_initial_message_length() {
        let bob = PQXDHResponder::generate().unwrap();
        let bundle = bob.public_bundle();
        let alice = PQXDHInitiator::new(&bundle).unwrap();
        let (_, msg) = alice.create_initial_message().unwrap();
        assert_eq!(msg.len(), 32 + 1088, "initial message must be 1120 bytes");
    }
}
