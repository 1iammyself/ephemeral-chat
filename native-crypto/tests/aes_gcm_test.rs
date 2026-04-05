use ephchat_crypto::aes_gcm::AESGCMKey;

#[test]
fn test_roundtrip() {
    let key = AESGCMKey::generate();
    let plaintext = b"hello ephemeral world";
    let aad = b"room:xyz";
    let ciphertext = key.encrypt(plaintext, aad).unwrap();
    let decrypted = key.decrypt(&ciphertext, aad).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_tamper_detection() {
    let key = AESGCMKey::generate();
    let mut ciphertext = key.encrypt(b"secret", b"aad").unwrap();
    // Flip a bit in the ciphertext portion (after nonce)
    ciphertext[12] ^= 0xFF;
    assert!(key.decrypt(&ciphertext, b"aad").is_err());
}

#[test]
fn test_wrong_aad_rejected() {
    let key = AESGCMKey::generate();
    let ciphertext = key.encrypt(b"secret", b"correct-aad").unwrap();
    assert!(key.decrypt(&ciphertext, b"wrong-aad").is_err());
}

#[test]
fn test_nonce_uniqueness() {
    let key = AESGCMKey::generate();
    let ct1 = key.encrypt(b"same plaintext", b"").unwrap();
    let ct2 = key.encrypt(b"same plaintext", b"").unwrap();
    // Nonces should differ (probabilistic, but overwhelmingly true)
    assert_ne!(&ct1[..12], &ct2[..12]);
}

#[test]
fn test_from_bytes_wrong_length() {
    assert!(AESGCMKey::from_bytes(&[0u8; 16]).is_err());
    assert!(AESGCMKey::from_bytes(&[0u8; 33]).is_err());
    assert!(AESGCMKey::from_bytes(&[0u8; 32]).is_ok());
}
