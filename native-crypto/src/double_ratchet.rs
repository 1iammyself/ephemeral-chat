use x25519_dalek::PublicKey;
use crate::Result;

pub struct RatchetKey;
impl RatchetKey {
    pub fn generate() -> Result<Self> { todo!() }
    pub fn public(&self) -> PublicKey { todo!() }
}

pub struct DoubleRatchetSession {
    pub sending_chain_key: Vec<u8>,
}
impl DoubleRatchetSession {
    pub fn new_initiator(_shared: &[u8; 32], _my: &RatchetKey, _peer: &PublicKey) -> Result<Self> { todo!() }
    pub fn new_responder(_shared: &[u8; 32], _my: &RatchetKey, _peer: &PublicKey) -> Result<Self> { todo!() }
    pub fn encrypt(&mut self, _plaintext: &[u8]) -> Result<Vec<u8>> { todo!() }
    pub fn decrypt(&mut self, _ciphertext: &[u8]) -> Result<Vec<u8>> { todo!() }
}
