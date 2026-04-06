use ephchat_crypto::double_ratchet::{DoubleRatchetSession, RatchetKey};
use rand::rngs::OsRng;
use x25519_dalek::StaticSecret;

fn make_shared_secret() -> [u8; 32] {
    let a = StaticSecret::random_from_rng(OsRng);
    let b = StaticSecret::random_from_rng(OsRng);
    let pub_b = x25519_dalek::PublicKey::from(&b);
    a.diffie_hellman(&pub_b).to_bytes()
}

#[test]
fn test_basic_roundtrip() {
    let shared = make_shared_secret();
    let alice_key = RatchetKey::generate().unwrap();
    let bob_key = RatchetKey::generate().unwrap();

    let mut alice =
        DoubleRatchetSession::new_initiator(&shared, &alice_key, &bob_key.public()).unwrap();
    let mut bob =
        DoubleRatchetSession::new_responder(&shared, &bob_key, &alice_key.public()).unwrap();

    let plaintext = b"hello from alice";
    let ciphertext = alice.encrypt(plaintext).unwrap();
    let decrypted = bob.decrypt(&ciphertext).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_bidirectional() {
    let shared = make_shared_secret();
    let alice_key = RatchetKey::generate().unwrap();
    let bob_key = RatchetKey::generate().unwrap();

    let mut alice =
        DoubleRatchetSession::new_initiator(&shared, &alice_key, &bob_key.public()).unwrap();
    let mut bob =
        DoubleRatchetSession::new_responder(&shared, &bob_key, &alice_key.public()).unwrap();

    // Alice → Bob
    let ct1 = alice.encrypt(b"hello bob").unwrap();
    assert_eq!(bob.decrypt(&ct1).unwrap(), b"hello bob");

    // Bob → Alice (triggers DH ratchet step in Alice)
    let ct2 = bob.encrypt(b"hello alice").unwrap();
    assert_eq!(alice.decrypt(&ct2).unwrap(), b"hello alice");

    // Alice → Bob again (new chain after ratchet)
    let ct3 = alice.encrypt(b"alice again").unwrap();
    assert_eq!(bob.decrypt(&ct3).unwrap(), b"alice again");
}

#[test]
fn test_out_of_order_messages() {
    let shared = make_shared_secret();
    let alice_key = RatchetKey::generate().unwrap();
    let bob_key = RatchetKey::generate().unwrap();

    let mut alice =
        DoubleRatchetSession::new_initiator(&shared, &alice_key, &bob_key.public()).unwrap();
    let mut bob =
        DoubleRatchetSession::new_responder(&shared, &bob_key, &alice_key.public()).unwrap();

    // Alice sends 3 messages
    let ct0 = alice.encrypt(b"msg 0").unwrap();
    let ct1 = alice.encrypt(b"msg 1").unwrap();
    let ct2 = alice.encrypt(b"msg 2").unwrap();

    // Bob receives them out of order: 2, 0, 1
    assert_eq!(bob.decrypt(&ct2).unwrap(), b"msg 2");
    assert_eq!(bob.decrypt(&ct0).unwrap(), b"msg 0");
    assert_eq!(bob.decrypt(&ct1).unwrap(), b"msg 1");
}

#[test]
fn test_max_skip_enforcement() {
    let shared = make_shared_secret();
    let alice_key = RatchetKey::generate().unwrap();
    let bob_key = RatchetKey::generate().unwrap();

    let mut alice =
        DoubleRatchetSession::new_initiator(&shared, &alice_key, &bob_key.public()).unwrap();
    let mut bob =
        DoubleRatchetSession::new_responder(&shared, &bob_key, &alice_key.public()).unwrap();

    // Alice sends 1002 messages; Bob only tries to decrypt the last one.
    // Decrypting message #1001 requires skipping 1001 messages — exceeds MAX_SKIP (1000).
    let mut last_ct = Vec::new();
    for i in 0..1002 {
        last_ct = alice.encrypt(format!("msg {}", i).as_bytes()).unwrap();
    }
    assert!(bob.decrypt(&last_ct).is_err());
}
