//! Crypto — Certificate generation, fingerprints, and pairing codes
//!
//! Each session generates an ephemeral self-signed TLS certificate.
//! Pairing codes are derived from both peers' certificate fingerprints.
//! This prevents MITM attacks — if an attacker inserts themselves,
//! the pairing codes won't match.

use rcgen::{CertificateParams, KeyPair, PKCS_ECDSA_P256_SHA256};
use ring::digest::{digest, SHA256};
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// Generated identity for a session — contains cert + private key
#[derive(Clone)]
pub struct SessionIdentity {
    /// DER-encoded self-signed certificate
    pub cert_der: Vec<u8>,
    /// DER-encoded private key
    pub key_der: Vec<u8>,
    /// SHA-256 fingerprint of the certificate (hex)
    pub fingerprint: String,
}

impl SessionIdentity {
    /// Generate a new ephemeral session identity
    pub fn generate() -> Result<Self, CryptoError> {
        let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256)
            .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

        let params = CertificateParams::new(vec!["ephemeral-chat.local".to_string()])
            .map_err(|e| CryptoError::CertGeneration(e.to_string()))?;

        let cert = params
            .self_signed(&key_pair)
            .map_err(|e| CryptoError::CertGeneration(e.to_string()))?;

        let cert_der = cert.der().to_vec();
        let key_der = key_pair.serialize_der();
        let fingerprint = compute_fingerprint(&cert_der);

        Ok(Self {
            cert_der,
            key_der,
            fingerprint,
        })
    }

    /// Build rustls server config from this identity
    pub fn server_config(&self) -> Result<Arc<rustls::ServerConfig>, CryptoError> {
        let cert = rustls::pki_types::CertificateDer::from(self.cert_der.clone());
        let key = rustls::pki_types::PrivateKeyDer::try_from(self.key_der.clone())
            .map_err(|e| CryptoError::TlsConfig(e.to_string()))?;

        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert], key)
            .map_err(|e| CryptoError::TlsConfig(e.to_string()))?;

        Ok(Arc::new(config))
    }

    /// Build rustls client config (skip server cert verification — we use pairing codes)
    pub fn client_config(&self) -> Result<Arc<rustls::ClientConfig>, CryptoError> {
        let cert = rustls::pki_types::CertificateDer::from(self.cert_der.clone());
        let key = rustls::pki_types::PrivateKeyDer::try_from(self.key_der.clone())
            .map_err(|e| CryptoError::TlsConfig(e.to_string()))?;

        let config = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(SkipServerVerification))
            .with_client_auth_cert(vec![cert], key)
            .map_err(|e| CryptoError::TlsConfig(e.to_string()))?;

        Ok(Arc::new(config))
    }
}

/// Compute SHA-256 fingerprint of a DER-encoded certificate
pub fn compute_fingerprint(cert_der: &[u8]) -> String {
    let hash = digest(&SHA256, cert_der);
    hex::encode(hash.as_ref())
}

/// Derive a 6-digit pairing code from two certificate fingerprints.
/// The code is the same regardless of which peer is "local" vs "remote"
/// because we sort the fingerprints before hashing.
pub fn derive_pairing_code(fingerprint_a: &str, fingerprint_b: &str) -> String {
    let mut fps = [fingerprint_a, fingerprint_b];
    fps.sort(); // Canonical order

    let mut hasher = Sha256::new();
    hasher.update(fps[0].as_bytes());
    hasher.update(fps[1].as_bytes());
    let result = hasher.finalize();

    // Take first 3 bytes → 6 hex chars → convert to 6-digit decimal
    let num = u32::from_be_bytes([0, result[0], result[1], result[2]]);
    format!("{:06}", num % 1_000_000)
}

/// Compute SHA-256 hash of file data (for integrity verification)
pub fn hash_file_data(data: &[u8]) -> String {
    let hash = digest(&SHA256, data);
    hex::encode(hash.as_ref())
}

/// Incremental file hasher for streaming large files
pub struct StreamingHasher {
    hasher: Sha256,
    bytes_hashed: u64,
}

impl StreamingHasher {
    pub fn new() -> Self {
        Self {
            hasher: Sha256::new(),
            bytes_hashed: 0,
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.hasher.update(data);
        self.bytes_hashed += data.len() as u64;
    }

    pub fn finalize(self) -> String {
        hex::encode(self.hasher.finalize())
    }

    pub fn bytes_hashed(&self) -> u64 {
        self.bytes_hashed
    }
}

impl Default for StreamingHasher {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Custom TLS Verifier ───────────────────────────────────

/// Skip server certificate verification — we rely on pairing codes
/// instead of a CA chain. Both peers display the same 6-digit code
/// derived from their certificate fingerprints.
#[derive(Debug)]
struct SkipServerVerification;

impl rustls::client::danger::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ED25519,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
        ]
    }
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("key generation failed: {0}")]
    KeyGeneration(String),
    #[error("certificate generation failed: {0}")]
    CertGeneration(String),
    #[error("TLS configuration failed: {0}")]
    TlsConfig(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_generation() {
        let identity = SessionIdentity::generate().unwrap();
        assert!(!identity.cert_der.is_empty());
        assert!(!identity.key_der.is_empty());
        assert_eq!(identity.fingerprint.len(), 64); // SHA-256 hex
    }

    #[test]
    fn test_pairing_code_symmetry() {
        let code_ab = derive_pairing_code("fingerprint_a", "fingerprint_b");
        let code_ba = derive_pairing_code("fingerprint_b", "fingerprint_a");
        assert_eq!(code_ab, code_ba);
        assert_eq!(code_ab.len(), 6);
    }

    #[test]
    fn test_pairing_code_different_for_different_peers() {
        let code1 = derive_pairing_code("fp1", "fp2");
        let code2 = derive_pairing_code("fp1", "fp3");
        assert_ne!(code1, code2);
    }

    #[test]
    fn test_streaming_hasher() {
        let mut hasher = StreamingHasher::new();
        hasher.update(b"hello ");
        hasher.update(b"world");
        let hash = hasher.finalize();
        assert_eq!(hash, hash_file_data(b"hello world"));
    }
}
