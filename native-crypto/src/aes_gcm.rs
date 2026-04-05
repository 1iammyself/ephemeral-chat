use crate::{CryptoError, Result};
use aes_gcm::{
    Aes256Gcm, Key, KeyInit, Nonce,
    aead::Aead,
};
use rand::RngCore;
use rand::rngs::OsRng;
use zeroize::ZeroizeOnDrop;

const KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 12;

#[derive(ZeroizeOnDrop)]
pub struct AESGCMKey([u8; KEY_SIZE]);

impl AESGCMKey {
    /// Generate a new random 256-bit AES-GCM key using the OS CSPRNG.
    pub fn generate() -> Self {
        let mut bytes = [0u8; KEY_SIZE];
        OsRng.fill_bytes(&mut bytes);
        Self(bytes)
    }

    /// Construct an `AESGCMKey` from a byte slice.
    ///
    /// Returns `Err(CryptoError::InvalidKeyLength)` if `bytes` is not exactly 32 bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() != KEY_SIZE {
            return Err(CryptoError::InvalidKeyLength {
                expected: KEY_SIZE,
                got: bytes.len(),
            });
        }
        let mut key = [0u8; KEY_SIZE];
        key.copy_from_slice(bytes);
        Ok(Self(key))
    }

    /// Encrypt `plaintext` under this key with `aad` as additional authenticated data.
    ///
    /// A fresh 96-bit nonce is generated for every call.
    ///
    /// Output layout: `[ 12-byte nonce || ciphertext || 16-byte GCM tag ]`
    pub fn encrypt(&self, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));

        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, aes_gcm::aead::Payload { msg: plaintext, aad })
            .map_err(|_| CryptoError::EncryptionFailed)?;

        // Prepend the nonce so the receiver can split it off.
        let mut output = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);
        Ok(output)
    }

    /// Decrypt a blob produced by `encrypt`.
    ///
    /// Expects `ciphertext` = `[ 12-byte nonce || encrypted-data || tag ]`.
    /// Returns `Err(CryptoError::DecryptionFailed)` on any authentication or
    /// format failure so callers cannot distinguish between tampered data,
    /// wrong key, and wrong AAD.
    pub fn decrypt(&self, ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        if ciphertext.len() < NONCE_SIZE {
            return Err(CryptoError::DecryptionFailed);
        }

        let (nonce_bytes, encrypted) = ciphertext.split_at(NONCE_SIZE);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));

        cipher
            .decrypt(nonce, aes_gcm::aead::Payload { msg: encrypted, aad })
            .map_err(|_| CryptoError::DecryptionFailed)
    }
}
