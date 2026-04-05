use serde::{Serialize, Deserialize};
use crate::Result;

#[derive(Clone, Serialize, Deserialize)]
pub struct PQXDHPublicBundle {
    pub identity_key: [u8; 32],
    pub signed_prekey: [u8; 32],
    /// 64-byte Ed25519 signature stored as bytes for serde compatibility
    #[serde(with = "serde_bytes_64")]
    pub signed_prekey_signature: [u8; 64],
    pub ephemeral_prekey: [u8; 32],
}

mod serde_bytes_64 {
    use serde::{Serializer, Deserializer, Deserialize};

    pub fn serialize<S: Serializer>(bytes: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_bytes(bytes)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let v = Vec::<u8>::deserialize(d)?;
        v.try_into().map_err(|_| serde::de::Error::custom("expected 64 bytes"))
    }
}

pub struct PQXDHResponder;
impl PQXDHResponder {
    pub fn generate() -> Result<Self> { todo!() }
    pub fn public_bundle(&self) -> PQXDHPublicBundle { todo!() }
    pub fn receive_initial_message(&self, _initiator_ephemeral: &[u8; 32]) -> Result<[u8; 32]> { todo!() }
}

pub struct PQXDHInitiator;
impl PQXDHInitiator {
    pub fn new(_bundle: &PQXDHPublicBundle) -> Result<Self> { todo!() }
    pub fn create_initial_message(&self) -> Result<([u8; 32], [u8; 32])> { todo!() }
}
