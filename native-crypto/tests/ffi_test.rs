use ephchat_crypto::ffi::*;

#[test]
fn test_ffi_aes_gcm_roundtrip() {
    let key = [0u8; 32]; // all-zero test key
    let plaintext = b"hello ffi world";
    let aad = b"test-aad";

    let mut ct_buf = vec![0u8; plaintext.len() + 12 + 16 + 1];
    let mut ct_len = 0usize;

    let rc = unsafe {
        ephchat_aes_gcm_encrypt(
            key.as_ptr(),
            plaintext.as_ptr(),
            plaintext.len(),
            aad.as_ptr(),
            aad.len(),
            ct_buf.as_mut_ptr(),
            ct_buf.len(),
            &mut ct_len,
        )
    };
    assert_eq!(rc, EPHCHAT_OK);
    assert!(ct_len > 0);

    let mut pt_buf = vec![0u8; ct_len];
    let mut pt_len = 0usize;
    let rc = unsafe {
        ephchat_aes_gcm_decrypt(
            key.as_ptr(),
            ct_buf.as_ptr(),
            ct_len,
            aad.as_ptr(),
            aad.len(),
            pt_buf.as_mut_ptr(),
            pt_buf.len(),
            &mut pt_len,
        )
    };
    assert_eq!(rc, EPHCHAT_OK);
    assert_eq!(&pt_buf[..pt_len], plaintext);
}

#[test]
fn test_ffi_null_ptr_returns_error() {
    let mut out_len = 0usize;
    let rc = unsafe {
        ephchat_aes_gcm_encrypt(
            std::ptr::null(),
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            0,
            &mut out_len,
        )
    };
    assert_eq!(rc, EPHCHAT_ERR_NULL_PTR);
}

#[test]
fn test_ffi_hkdf_derive() {
    let ikm = b"test input key material";
    let salt = b"test salt";
    let info = b"test context";
    let mut out = vec![0u8; 32];

    let rc = unsafe {
        ephchat_hkdf_derive(
            ikm.as_ptr(),
            ikm.len(),
            salt.as_ptr(),
            salt.len(),
            info.as_ptr(),
            info.len(),
            out.as_mut_ptr(),
            32,
        )
    };
    assert_eq!(rc, EPHCHAT_OK);
    assert_ne!(out, vec![0u8; 32]); // output should not be zeros
}

#[test]
fn test_ffi_pqxdh_roundtrip() {
    // Generate bundle
    let mut bundle_buf = vec![0u8; 8192];
    let mut bundle_len = 0usize;

    let rc = unsafe {
        ephchat_pqxdh_generate_bundle(bundle_buf.as_mut_ptr(), bundle_buf.len(), &mut bundle_len)
    };
    assert_eq!(rc, EPHCHAT_OK);
    assert!(bundle_len > 0);

    // Create initial message
    let mut shared = [0u8; 32];
    let mut msg_buf = vec![0u8; 4096];
    let mut msg_len = 0usize;

    let rc = unsafe {
        ephchat_pqxdh_create_initial_message(
            bundle_buf.as_ptr(),
            bundle_len,
            shared.as_mut_ptr(),
            msg_buf.as_mut_ptr(),
            msg_buf.len(),
            &mut msg_len,
        )
    };
    assert_eq!(rc, EPHCHAT_OK);
    assert_ne!(shared, [0u8; 32]);
    assert!(msg_len > 0);
}
