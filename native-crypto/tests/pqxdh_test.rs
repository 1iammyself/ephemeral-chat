use ephchat_crypto::pqxdh::{PQXDHInitiator, PQXDHResponder};

/// Both sides of the handshake must derive the same 32-byte shared secret.
#[test]
fn test_pqxdh_roundtrip() {
    // Bob generates his public bundle.
    let bob = PQXDHResponder::generate().unwrap();
    let bundle = bob.public_bundle();

    // Alice creates an initial message using Bob's bundle.
    let alice = PQXDHInitiator::new(&bundle).unwrap();
    let (alice_shared, initial_msg) = alice.create_initial_message().unwrap();

    // Bob receives Alice's initial message and derives the shared secret.
    let bob_shared = bob.receive_initial_message(&initial_msg).unwrap();

    // Both parties must have derived the same shared secret.
    assert_eq!(alice_shared, bob_shared, "PQXDH shared secrets must match");
}

/// A tampered signed prekey signature must cause `PQXDHInitiator::new` to fail.
#[test]
fn test_invalid_signature_rejected() {
    let bob = PQXDHResponder::generate().unwrap();
    let mut bundle = bob.public_bundle();

    // Corrupt the first byte of the Ed25519 signature.
    bundle.signed_prekey_signature[0] ^= 0xFF;

    // Alice must reject the bundle with an error.
    assert!(
        PQXDHInitiator::new(&bundle).is_err(),
        "initiator must reject a bundle with an invalid signature"
    );
}

/// Two independent Alice sessions must produce different shared secrets because
/// each uses a distinct ephemeral X25519 key and a freshly encapsulated KEM secret.
#[test]
fn test_shared_secrets_are_unique() {
    let bob = PQXDHResponder::generate().unwrap();
    let bundle = bob.public_bundle();

    let alice1 = PQXDHInitiator::new(&bundle).unwrap();
    let alice2 = PQXDHInitiator::new(&bundle).unwrap();

    let (s1, _) = alice1.create_initial_message().unwrap();
    let (s2, _) = alice2.create_initial_message().unwrap();

    assert_ne!(s1, s2, "different sessions must produce different shared secrets");
}
