use crate::Result;
use zeroize::ZeroizeOnDrop;

#[derive(Clone, ZeroizeOnDrop)]
pub struct AESGCMKey([u8; 32]);

impl AESGCMKey {
    pub fn generate() -> Self { todo!("Implemented in Task 4") }
    pub fn from_bytes(_bytes: &[u8]) -> Result<Self> { todo!() }
    pub fn encrypt(&self, _plaintext: &[u8], _aad: &[u8]) -> Result<Vec<u8>> { todo!() }
    pub fn decrypt(&self, _ciphertext: &[u8], _aad: &[u8]) -> Result<Vec<u8>> { todo!() }
}
