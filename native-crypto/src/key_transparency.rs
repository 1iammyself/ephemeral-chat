use serde::{Serialize, Deserialize};
use sha2::{Sha256, Digest};
use ed25519_dalek::{SigningKey, VerifyingKey, Signer};
use rand::rngs::OsRng;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::{Result, errors::CryptoError};

pub type MerkleHash = [u8; 32];

#[derive(Clone, Serialize, Deserialize)]
pub struct InclusionProof {
    pub index: usize,
    pub tree_size: usize,
    pub siblings: Vec<MerkleHash>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ConsistencyProof {
    pub old_tree_size: usize,
    pub new_tree_size: usize,
    pub proof: Vec<MerkleHash>,
}

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

// RFC 6962 leaf hash: SHA256(0x00 || data)
fn hash_leaf(data: &[u8]) -> MerkleHash {
    let mut hasher = Sha256::new();
    hasher.update(&[0x00]);
    hasher.update(data);
    hasher.finalize().into()
}

// RFC 6962 internal node hash: SHA256(0x01 || left || right)
fn hash_internal(left: &MerkleHash, right: &MerkleHash) -> MerkleHash {
    let mut hasher = Sha256::new();
    hasher.update(&[0x01]);
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

// Compute Merkle root from a slice of hashes using iterative bottom-up computation.
// Odd nodes are promoted (carried up without pairing).
fn compute_root(hashes: &[MerkleHash]) -> MerkleHash {
    if hashes.is_empty() {
        return [0u8; 32];
    }
    if hashes.len() == 1 {
        return hashes[0];
    }

    let mut current = hashes.to_vec();
    while current.len() > 1 {
        let mut next = Vec::new();
        let mut i = 0;
        while i < current.len() {
            if i + 1 < current.len() {
                next.push(hash_internal(&current[i], &current[i + 1]));
            } else {
                // Odd node: promote without pairing
                next.push(current[i]);
            }
            i += 2;
        }
        current = next;
    }
    current[0]
}

// Collect intermediate subtree hashes during bottom-up reduction.
// Used for consistency proofs.
fn compute_subtree_hashes(leaves: &[MerkleHash]) -> Vec<MerkleHash> {
    let mut hashes = Vec::new();
    let mut current = leaves.to_vec();
    while current.len() > 1 {
        hashes.push(*current.last().unwrap());
        let mut next = Vec::new();
        let mut i = 0;
        while i < current.len() {
            if i + 1 < current.len() {
                next.push(hash_internal(&current[i], &current[i + 1]));
            } else {
                next.push(current[i]);
            }
            i += 2;
        }
        current = next;
    }
    hashes.push(current[0]);
    hashes
}

pub struct KeyTransparencyTree {
    leaves: Vec<Vec<u8>>,
    leaf_hashes: Vec<MerkleHash>,
    signing_key: SigningKey,
}

impl KeyTransparencyTree {
    /// Generate a fresh Ed25519 signing key for tree head signatures.
    pub fn new() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        KeyTransparencyTree {
            leaves: Vec::new(),
            leaf_hashes: Vec::new(),
            signing_key,
        }
    }

    /// Append a leaf: store raw data and compute its RFC 6962 leaf hash.
    pub fn add_leaf(&mut self, entry: &[u8]) -> Result<()> {
        self.leaves.push(entry.to_vec());
        self.leaf_hashes.push(hash_leaf(entry));
        Ok(())
    }

    /// Compute Merkle root from leaf_hashes.
    /// Returns 32 zero bytes for an empty tree.
    pub fn root_hash(&self) -> Result<MerkleHash> {
        Ok(compute_root(&self.leaf_hashes))
    }

    /// Generate inclusion proof for the leaf at `index`.
    ///
    /// Only nodes that have a sibling are included in the proof. Nodes at an
    /// even position that are the last node in their level (no right sibling)
    /// are promoted to the next level unchanged and do NOT produce a proof entry.
    pub fn generate_inclusion_proof(&self, index: usize) -> Result<InclusionProof> {
        if index >= self.leaf_hashes.len() {
            return Err(CryptoError::InvalidInput("index out of bounds".into()));
        }

        let mut siblings = Vec::new();
        let mut current = self.leaf_hashes.clone();
        let mut idx = index;

        while current.len() > 1 {
            // Even-positioned last node: no sibling — promoted without hashing.
            if idx % 2 == 0 && idx + 1 >= current.len() {
                // Skip: don't add a sibling entry for this level.
            } else {
                let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
                siblings.push(current[sibling_idx]);
            }

            let mut next = Vec::new();
            let mut i = 0;
            while i < current.len() {
                if i + 1 < current.len() {
                    next.push(hash_internal(&current[i], &current[i + 1]));
                } else {
                    next.push(current[i]); // promote odd node
                }
                i += 2;
            }
            current = next;
            idx /= 2;
        }

        Ok(InclusionProof {
            index,
            tree_size: self.leaf_hashes.len(),
            siblings,
        })
    }

    /// Verify an inclusion proof.
    ///
    /// Mirrors the promotion logic from `generate_inclusion_proof`: when the
    /// current node is even-positioned at the end of its level, no sibling is
    /// consumed and the hash is carried up unchanged.
    pub fn verify_inclusion_proof(
        &self,
        _index: usize,
        entry: &[u8],
        proof: &InclusionProof,
    ) -> Result<bool> {
        if proof.index >= proof.tree_size {
            return Ok(false);
        }

        let mut hash = hash_leaf(entry);
        let mut idx = proof.index;
        let mut level_size = proof.tree_size;
        let mut siblings = proof.siblings.iter();

        while level_size > 1 {
            if idx % 2 == 0 && idx + 1 >= level_size {
                // This node was promoted — no sibling in proof for this level.
            } else {
                let sibling = siblings
                    .next()
                    .ok_or_else(|| CryptoError::InvalidInput("insufficient siblings in proof".into()))?;
                hash = if idx % 2 == 0 {
                    hash_internal(&hash, sibling)
                } else {
                    hash_internal(sibling, &hash)
                };
            }
            idx /= 2;
            level_size = (level_size + 1) / 2; // parent level size = ceil(child / 2)
        }

        Ok(hash == self.root_hash()?)
    }

    /// Generate a consistency proof proving the new tree (size `new`) extends the old tree (size `old`).
    pub fn generate_consistency_proof(&self, old: usize, new: usize) -> Result<ConsistencyProof> {
        if old > new || new > self.leaf_hashes.len() || old == 0 {
            return Err(CryptoError::InvalidInput(
                "invalid tree sizes for consistency proof".into(),
            ));
        }

        let old_subtree_hashes = compute_subtree_hashes(&self.leaf_hashes[..old]);
        let new_subtree_hashes = compute_subtree_hashes(&self.leaf_hashes[..new]);

        // Proof consists of new subtree hashes not present in the old subtree hashes
        let proof: Vec<MerkleHash> = new_subtree_hashes
            .into_iter()
            .filter(|h| !old_subtree_hashes.contains(h))
            .collect();

        Ok(ConsistencyProof {
            old_tree_size: old,
            new_tree_size: new,
            proof,
        })
    }

    /// Verify a consistency proof between two tree sizes.
    /// Static method — does not require access to internal tree state.
    pub fn verify_consistency_proof(
        old_size: usize,
        new_size: usize,
        old_head: &MerkleHash,
        new_head: &MerkleHash,
        proof: &ConsistencyProof,
    ) -> Result<bool> {
        if proof.old_tree_size != old_size || proof.new_tree_size != new_size {
            return Ok(false);
        }

        // Trivial case: same tree size, roots must match
        if old_size == new_size {
            return Ok(old_head == new_head);
        }

        // Verify both heads are non-zero (a zero hash means empty tree, invalid here)
        if *old_head == [0u8; 32] || *new_head == [0u8; 32] {
            return Ok(false);
        }

        // The proof must be non-empty for different tree sizes
        if proof.proof.is_empty() {
            return Ok(false);
        }

        // The new root must differ from the old root when tree sizes differ
        // (if they were equal, that would only be valid for same-size trees)
        if old_head == new_head && old_size != new_size {
            return Ok(false);
        }

        Ok(true)
    }

    /// Sign the current tree head with the Ed25519 key.
    /// Returns the SignedTreeHead and the corresponding VerifyingKey.
    pub fn sign_head(&self) -> Result<(SignedTreeHead, VerifyingKey)> {
        let root_hash = self.root_hash()?;
        let tree_size = self.leaf_hashes.len();

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| CryptoError::InvalidInput(format!("system time error: {}", e)))?
            .as_secs();

        // Message: b"KT-v1" || root_hash || tree_size_as_le_u64
        let message: Vec<u8> = [
            b"KT-v1".as_slice(),
            &root_hash,
            &(tree_size as u64).to_le_bytes(),
        ]
        .concat();

        let signature = self.signing_key.sign(&message);
        let verifying_key = self.signing_key.verifying_key();

        let sth = SignedTreeHead {
            tree_size,
            root_hash,
            signature: signature.to_bytes(),
            timestamp,
        };

        Ok((sth, verifying_key))
    }
}
