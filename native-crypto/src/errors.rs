use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum CryptoError {
    InvalidKeyLength { expected: usize, got: usize },
    DecryptionFailed,
    KeyDerivationFailed(String),
    InvalidNonce,
    InvalidInput(String),
    SerializationError(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CryptoError::InvalidKeyLength { expected, got } =>
                write!(f, "Invalid key length: expected {}, got {}", expected, got),
            CryptoError::DecryptionFailed =>
                write!(f, "Decryption failed: authentication tag mismatch or corrupted ciphertext"),
            CryptoError::KeyDerivationFailed(msg) =>
                write!(f, "Key derivation failed: {}", msg),
            CryptoError::InvalidNonce =>
                write!(f, "Invalid nonce: must be exactly 12 bytes"),
            CryptoError::InvalidInput(msg) =>
                write!(f, "Invalid input: {}", msg),
            CryptoError::SerializationError(msg) =>
                write!(f, "Serialization error: {}", msg),
        }
    }
}

impl std::error::Error for CryptoError {}

pub type Result<T> = std::result::Result<T, CryptoError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display_invalid_key_length() {
        let err = CryptoError::InvalidKeyLength { expected: 32, got: 16 };
        assert!(err.to_string().contains("32"));
        assert!(err.to_string().contains("16"));
    }

    #[test]
    fn test_error_display_decryption_failed() {
        let err = CryptoError::DecryptionFailed;
        assert!(err.to_string().contains("Decryption failed"));
    }
}
