use ephchat_crypto::hkdf::HKDFDeriver;

/// RFC 5869 Test Case 1 (SHA-256, basic)
/// IKM  = 0x0b0b...0b (22 bytes)
/// Salt = 0x000102...0c (13 bytes)
/// Info = 0xf0f1...f9 (10 bytes)
/// L    = 42 bytes
/// OKM  = 0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865
#[test]
fn test_rfc5869_case1() {
    let ikm = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
    let salt = hex::decode("000102030405060708090a0b0c").unwrap();
    let info = hex::decode("f0f1f2f3f4f5f6f7f8f9").unwrap();
    let expected = hex::decode(
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    )
    .unwrap();

    let deriver = HKDFDeriver::new(&ikm, Some(&salt));
    let mut okm = vec![0u8; 42];
    deriver.derive_var(&info, &mut okm).unwrap();
    assert_eq!(okm, expected);
}

#[test]
fn test_derive_32_bytes() {
    let deriver = HKDFDeriver::new(b"input key material", Some(b"salt"));
    let key: [u8; 32] = deriver.derive(b"info").unwrap();
    assert_eq!(key.len(), 32);
}

#[test]
fn test_derive_64_bytes() {
    let deriver = HKDFDeriver::new(b"ikm", Some(b"salt"));
    let key: [u8; 64] = deriver.derive(b"info").unwrap();
    assert_eq!(key.len(), 64);
}

#[test]
fn test_no_salt_uses_default() {
    // None salt should work (defaults to 32 zero bytes per RFC 5869)
    let deriver = HKDFDeriver::new(b"my key material", None);
    let key: [u8; 32] = deriver.derive(b"context").unwrap();
    assert_eq!(key.len(), 32);
}

#[test]
fn test_context_separation() {
    let deriver = HKDFDeriver::new(b"shared ikm", Some(b"salt"));
    let key_a: [u8; 32] = deriver.derive(b"context-A").unwrap();
    let key_b: [u8; 32] = deriver.derive(b"context-B").unwrap();
    assert_ne!(key_a, key_b); // Different info → different keys
}

#[test]
fn test_same_inputs_deterministic() {
    let d1 = HKDFDeriver::new(b"ikm", Some(b"salt"));
    let d2 = HKDFDeriver::new(b"ikm", Some(b"salt"));
    let k1: [u8; 32] = d1.derive(b"info").unwrap();
    let k2: [u8; 32] = d2.derive(b"info").unwrap();
    assert_eq!(k1, k2); // HKDF is deterministic
}

#[test]
fn test_derive_oversized_fails() {
    let d = HKDFDeriver::new(b"ikm", Some(b"salt"));
    let mut buf = vec![0u8; 8161]; // 255 * 32 + 1 = exceeds max
    assert!(d.derive_var(b"info", &mut buf).is_err());
}

#[test]
fn test_derive_empty_output_fails() {
    let d = HKDFDeriver::new(b"ikm", Some(b"salt"));
    let mut buf = vec![];
    assert!(d.derive_var(b"info", &mut buf).is_err());
}
