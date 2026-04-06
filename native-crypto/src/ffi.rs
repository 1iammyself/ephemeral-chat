use std::panic::catch_unwind;
use std::panic::AssertUnwindSafe;
use std::slice;

// ─── Error codes ────────────────────────────────────────────────────────────
pub const EPHCHAT_OK: i32 = 0;
pub const EPHCHAT_ERR_NULL_PTR: i32 = -1;
pub const EPHCHAT_ERR_INVALID_LENGTH: i32 = -2;
pub const EPHCHAT_ERR_DECRYPTION_FAILED: i32 = -3;
pub const EPHCHAT_ERR_KEY_DERIVATION: i32 = -4;
pub const EPHCHAT_ERR_SERIALIZATION: i32 = -5;
pub const EPHCHAT_ERR_INVALID_INPUT: i32 = -6;
pub const EPHCHAT_ERR_PANIC: i32 = -99;

// ─── Null-pointer guard macro ────────────────────────────────────────────────
macro_rules! check_null {
    ($ptr:expr) => {
        if $ptr.is_null() {
            return EPHCHAT_ERR_NULL_PTR;
        }
    };
}

// ─── Error mapper ────────────────────────────────────────────────────────────
fn map_err(e: crate::errors::CryptoError) -> i32 {
    use crate::errors::CryptoError::*;
    match e {
        InvalidKeyLength { .. } => EPHCHAT_ERR_INVALID_LENGTH,
        DecryptionFailed => EPHCHAT_ERR_DECRYPTION_FAILED,
        KeyDerivationFailed(_) => EPHCHAT_ERR_KEY_DERIVATION,
        SerializationError(_) => EPHCHAT_ERR_SERIALIZATION,
        InvalidInput(_) | EncryptionFailed | InvalidNonce => EPHCHAT_ERR_INVALID_INPUT,
    }
}

// ─── Version ─────────────────────────────────────────────────────────────────

/// Returns a null-terminated ASCII string with the library version.
#[no_mangle]
pub extern "C" fn ephchat_version() -> *const std::os::raw::c_char {
    b"ephchat-crypto v0.1.0\0".as_ptr() as *const std::os::raw::c_char
}

// ─── AES-GCM encrypt ─────────────────────────────────────────────────────────

/// Encrypts `plaintext_len` bytes with the 32-byte key at `key_ptr`.
///
/// Output layout written to `out_buf`: `[ 12-byte nonce || ciphertext || 16-byte tag ]`.
/// `out_buf_len` must be at least `plaintext_len + 28`.
/// On success `*out_len` is set to the number of bytes written and 0 is returned.
#[no_mangle]
pub unsafe extern "C" fn ephchat_aes_gcm_encrypt(
    key_ptr: *const u8,
    plaintext: *const u8,
    plaintext_len: usize,
    aad: *const u8,
    aad_len: usize,
    out_buf: *mut u8,
    out_buf_len: usize,
    out_len: *mut usize,
) -> i32 {
    check_null!(key_ptr);
    check_null!(plaintext);
    check_null!(out_buf);
    check_null!(out_len);
    // aad is allowed to be null only when aad_len == 0
    if aad_len > 0 {
        check_null!(aad);
    }

    let result = catch_unwind(AssertUnwindSafe(|| {
        let key_bytes = slice::from_raw_parts(key_ptr, 32);
        let pt = slice::from_raw_parts(plaintext, plaintext_len);
        let ad: &[u8] = if aad_len == 0 {
            &[]
        } else {
            slice::from_raw_parts(aad, aad_len)
        };

        let key = crate::aes_gcm::AESGCMKey::from_bytes(key_bytes)?;
        let ct = key.encrypt(pt, ad)?;

        if ct.len() > out_buf_len {
            return Err(crate::errors::CryptoError::InvalidInput(
                "output buffer too small".into(),
            ));
        }

        std::ptr::copy_nonoverlapping(ct.as_ptr(), out_buf, ct.len());
        *out_len = ct.len();
        Ok(())
    }));

    match result {
        Ok(Ok(())) => EPHCHAT_OK,
        Ok(Err(e)) => map_err(e),
        Err(_) => EPHCHAT_ERR_PANIC,
    }
}

// ─── AES-GCM decrypt ─────────────────────────────────────────────────────────

/// Decrypts a blob produced by `ephchat_aes_gcm_encrypt`.
///
/// `ciphertext` must be `[ 12-byte nonce || encrypted-data || 16-byte tag ]`.
/// On success, the recovered plaintext is written to `out_buf` and `*out_len` is
/// set to its length.
#[no_mangle]
pub unsafe extern "C" fn ephchat_aes_gcm_decrypt(
    key_ptr: *const u8,
    ciphertext: *const u8,
    ciphertext_len: usize,
    aad: *const u8,
    aad_len: usize,
    out_buf: *mut u8,
    out_buf_len: usize,
    out_len: *mut usize,
) -> i32 {
    check_null!(key_ptr);
    check_null!(ciphertext);
    check_null!(out_buf);
    check_null!(out_len);
    if aad_len > 0 {
        check_null!(aad);
    }

    let result = catch_unwind(AssertUnwindSafe(|| {
        let key_bytes = slice::from_raw_parts(key_ptr, 32);
        let ct = slice::from_raw_parts(ciphertext, ciphertext_len);
        let ad: &[u8] = if aad_len == 0 {
            &[]
        } else {
            slice::from_raw_parts(aad, aad_len)
        };

        let key = crate::aes_gcm::AESGCMKey::from_bytes(key_bytes)?;
        let pt = key.decrypt(ct, ad)?;

        if pt.len() > out_buf_len {
            return Err(crate::errors::CryptoError::InvalidInput(
                "output buffer too small".into(),
            ));
        }

        std::ptr::copy_nonoverlapping(pt.as_ptr(), out_buf, pt.len());
        *out_len = pt.len();
        Ok(())
    }));

    match result {
        Ok(Ok(())) => EPHCHAT_OK,
        Ok(Err(e)) => map_err(e),
        Err(_) => EPHCHAT_ERR_PANIC,
    }
}

// ─── HKDF derive ─────────────────────────────────────────────────────────────

/// HKDF-Extract + Expand.
///
/// When `salt` is null, the RFC 5869 default (hash-length zero bytes) is used.
/// `out_len` is the desired output length in bytes (not a pointer); the result is
/// written to `out_buf`.
#[no_mangle]
pub unsafe extern "C" fn ephchat_hkdf_derive(
    ikm: *const u8,
    ikm_len: usize,
    salt: *const u8,
    salt_len: usize,
    info: *const u8,
    info_len: usize,
    out_buf: *mut u8,
    out_len: usize,
) -> i32 {
    check_null!(ikm);
    check_null!(out_buf);
    // info may be null when info_len == 0
    if info_len > 0 {
        check_null!(info);
    }
    if salt_len > 0 {
        check_null!(salt);
    }

    let result = catch_unwind(AssertUnwindSafe(|| {
        let ikm_bytes = slice::from_raw_parts(ikm, ikm_len);
        let salt_opt: Option<&[u8]> = if salt.is_null() || salt_len == 0 {
            None
        } else {
            Some(slice::from_raw_parts(salt, salt_len))
        };
        let info_bytes: &[u8] = if info_len == 0 {
            &[]
        } else {
            slice::from_raw_parts(info, info_len)
        };

        let deriver = crate::hkdf::HKDFDeriver::new(ikm_bytes, salt_opt);

        let out_slice = slice::from_raw_parts_mut(out_buf, out_len);
        deriver.derive_var(info_bytes, out_slice)?;
        Ok(())
    }));

    match result {
        Ok(Ok(())) => EPHCHAT_OK,
        Ok(Err(e)) => map_err(e),
        Err(_) => EPHCHAT_ERR_PANIC,
    }
}

// ─── PQXDH generate bundle ────────────────────────────────────────────────────

/// Generates a fresh PQXDH responder bundle and serialises it as JSON into
/// `out_buf`.  The responder private state is intentionally discarded — stateful
/// use requires the opaque-pointer pattern (out of scope for Phase 1).
///
/// On success `*out_len` is set to the number of bytes written (not including a
/// null terminator) and 0 is returned.
#[no_mangle]
pub unsafe extern "C" fn ephchat_pqxdh_generate_bundle(
    out_buf: *mut u8,
    out_buf_len: usize,
    out_len: *mut usize,
) -> i32 {
    check_null!(out_buf);
    check_null!(out_len);

    let result = catch_unwind(AssertUnwindSafe(|| {
        let responder = crate::pqxdh::PQXDHResponder::generate()?;
        let bundle = responder.public_bundle();

        let json = serde_json::to_vec(&bundle)
            .map_err(|e| crate::errors::CryptoError::SerializationError(e.to_string()))?;

        if json.len() > out_buf_len {
            return Err(crate::errors::CryptoError::InvalidInput(
                "output buffer too small for bundle JSON".into(),
            ));
        }

        std::ptr::copy_nonoverlapping(json.as_ptr(), out_buf, json.len());
        *out_len = json.len();
        Ok(())
    }));

    match result {
        Ok(Ok(())) => EPHCHAT_OK,
        Ok(Err(e)) => map_err(e),
        Err(_) => EPHCHAT_ERR_PANIC,
    }
}

// ─── PQXDH create initial message ────────────────────────────────────────────

/// Given a JSON-encoded `PQXDHPublicBundle` in `bundle_json`, creates an
/// initiator and computes the initial handshake message.
///
/// Outputs:
/// - 32 bytes of shared secret written to `shared_secret_buf`.
/// - The initial message (variable length) written to `msg_buf`; `*msg_len` is
///   set to the number of bytes written.
#[no_mangle]
pub unsafe extern "C" fn ephchat_pqxdh_create_initial_message(
    bundle_json: *const u8,
    bundle_json_len: usize,
    shared_secret_buf: *mut u8,
    msg_buf: *mut u8,
    msg_buf_len: usize,
    msg_len: *mut usize,
) -> i32 {
    check_null!(bundle_json);
    check_null!(shared_secret_buf);
    check_null!(msg_buf);
    check_null!(msg_len);

    let result = catch_unwind(AssertUnwindSafe(|| {
        let json_bytes = slice::from_raw_parts(bundle_json, bundle_json_len);

        let bundle: crate::pqxdh::PQXDHPublicBundle = serde_json::from_slice(json_bytes)
            .map_err(|e| crate::errors::CryptoError::SerializationError(e.to_string()))?;

        let initiator = crate::pqxdh::PQXDHInitiator::new(&bundle)?;
        let (shared, msg) = initiator.create_initial_message()?;

        // Write 32-byte shared secret.
        std::ptr::copy_nonoverlapping(shared.as_ptr(), shared_secret_buf, 32);

        if msg.len() > msg_buf_len {
            return Err(crate::errors::CryptoError::InvalidInput(
                "output buffer too small for initial message".into(),
            ));
        }

        std::ptr::copy_nonoverlapping(msg.as_ptr(), msg_buf, msg.len());
        *msg_len = msg.len();
        Ok(())
    }));

    match result {
        Ok(Ok(())) => EPHCHAT_OK,
        Ok(Err(e)) => map_err(e),
        Err(_) => EPHCHAT_ERR_PANIC,
    }
}
