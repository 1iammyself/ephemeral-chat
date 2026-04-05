use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::errors::CryptoError;
use crate::Result;

/// Maximum HKDF output length for SHA-256: 255 * HashLen = 255 * 32 = 8160 bytes.
const HKDF_MAX_OUTPUT: usize = 255 * 32;

pub struct HKDFDeriver {
    /// The 32-byte PRK produced by HKDF-Extract, zeroed on drop.
    prk: Zeroizing<Vec<u8>>,
}

impl HKDFDeriver {
    /// Perform HKDF-Extract.
    ///
    /// When `salt` is `None` the RFC 5869 §2.2 default is used: the `hkdf`
    /// crate substitutes a hash-length string of zero bytes internally, which
    /// matches the RFC exactly.
    pub fn new(ikm: &[u8], salt: Option<&[u8]>) -> Self {
        // Extract the PRK using HKDF-Extract.
        let (prk_arr, _) = Hkdf::<Sha256>::extract(salt, ikm);
        let prk = Zeroizing::new(prk_arr.to_vec());

        Self { prk }
    }

    /// HKDF-Expand into a fixed-size `[u8; N]` array.
    ///
    /// Returns `InvalidInput` if `N == 0` or `N > 8160`.
    pub fn derive<const N: usize>(&self, info: &[u8]) -> Result<[u8; N]> {
        if N == 0 {
            return Err(CryptoError::InvalidInput(
                "output length must be greater than 0".into(),
            ));
        }
        if N > HKDF_MAX_OUTPUT {
            return Err(CryptoError::InvalidInput(format!(
                "output length {} exceeds HKDF-SHA256 maximum of {} bytes",
                N, HKDF_MAX_OUTPUT
            )));
        }

        let hk = Hkdf::<Sha256>::from_prk(&self.prk)
            .map_err(|_| CryptoError::KeyDerivationFailed("invalid PRK length".into()))?;

        let mut okm = [0u8; N];
        hk.expand(info, &mut okm)
            .map_err(|_| CryptoError::KeyDerivationFailed("HKDF expand failed".into()))?;

        Ok(okm)
    }

    /// HKDF-Expand into a caller-provided buffer.
    ///
    /// Returns `InvalidInput` if `output.len() == 0` or `output.len() > 8160`.
    pub fn derive_var(&self, info: &[u8], output: &mut [u8]) -> Result<()> {
        let len = output.len();

        if len == 0 {
            return Err(CryptoError::InvalidInput(
                "output length must be greater than 0".into(),
            ));
        }
        if len > HKDF_MAX_OUTPUT {
            return Err(CryptoError::InvalidInput(format!(
                "output length {} exceeds HKDF-SHA256 maximum of {} bytes",
                len, HKDF_MAX_OUTPUT
            )));
        }

        let hk = Hkdf::<Sha256>::from_prk(&self.prk)
            .map_err(|_| CryptoError::KeyDerivationFailed("invalid PRK length".into()))?;

        hk.expand(info, output)
            .map_err(|_| CryptoError::KeyDerivationFailed("HKDF expand failed".into()))?;

        Ok(())
    }
}
