//! ephchat-crypto: Signal-grade cryptographic primitives for Ephemeral Chat.
//!
//! Implements:
//! - AES-256-GCM authenticated encryption
//! - HKDF-SHA256 key derivation
//! - Double Ratchet algorithm (Signal protocol)
//! - PQXDH post-quantum extended Diffie-Hellman
//! - Key Transparency Merkle tree (verification-first)
//! - C FFI exports for JavaScript integration

pub mod errors;
pub mod aes_gcm;
pub mod hkdf;
pub mod double_ratchet;
pub mod pqxdh;
pub mod key_transparency;
pub mod ffi;

pub use errors::{CryptoError, Result};
pub use aes_gcm::AESGCMKey;
pub use hkdf::HKDFDeriver;
pub use double_ratchet::{DoubleRatchetSession, RatchetKey};
pub use pqxdh::{PQXDHInitiator, PQXDHResponder, PQXDHPublicBundle};
pub use key_transparency::{KeyTransparencyTree, InclusionProof, ConsistencyProof, SignedTreeHead};
