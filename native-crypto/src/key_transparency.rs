use serde::{Serialize, Deserialize};
use ed25519_dalek::VerifyingKey;
use crate::Result;

pub type MerkleHash = [u8; 32];

#[derive(Clone, Serialize, Deserialize)]
pub struct InclusionProof { pub index: usize, pub tree_size: usize, pub siblings: Vec<MerkleHash> }

#[derive(Clone, Serialize, Deserialize)]
pub struct ConsistencyProof { pub old_tree_size: usize, pub new_tree_size: usize, pub proof: Vec<MerkleHash> }

#[derive(Clone, Serialize, Deserialize)]
pub struct SignedTreeHead {
    pub tree_size: usize,
    pub root_hash: MerkleHash,
    /// 64-byte Ed25519 signature stored as bytes for serde compatibility
    #[serde(with = "serde_bytes_64")]
    pub signature: [u8; 64],
    pub timestamp: u64,
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

pub struct KeyTransparencyTree;
impl KeyTransparencyTree {
    pub fn new() -> Self { todo!() }
    pub fn add_leaf(&mut self, _entry: &[u8]) -> Result<()> { todo!() }
    pub fn root_hash(&self) -> Result<MerkleHash> { todo!() }
    pub fn generate_inclusion_proof(&self, _index: usize) -> Result<InclusionProof> { todo!() }
    pub fn verify_inclusion_proof(&self, _index: usize, _entry: &[u8], _proof: &InclusionProof) -> Result<bool> { todo!() }
    pub fn generate_consistency_proof(&self, _old: usize, _new: usize) -> Result<ConsistencyProof> { todo!() }
    pub fn verify_consistency_proof(_old_size: usize, _new_size: usize, _old_head: &MerkleHash, _new_head: &MerkleHash, _proof: &ConsistencyProof) -> Result<bool> { todo!() }
    pub fn sign_head(&self) -> Result<(SignedTreeHead, VerifyingKey)> { todo!() }
}
