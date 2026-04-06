use ephchat_crypto::key_transparency::KeyTransparencyTree;

#[test]
fn test_inclusion_proof_valid() {
    let mut tree = KeyTransparencyTree::new();
    tree.add_leaf(b"alice:key1").unwrap();
    tree.add_leaf(b"bob:key2").unwrap();
    tree.add_leaf(b"carol:key3").unwrap();

    // Verify proof metadata for each leaf
    for i in 0..3 {
        let proof = tree.generate_inclusion_proof(i).unwrap();
        assert_eq!(proof.tree_size, 3);
        assert_eq!(proof.index, i);
    }

    let proof = tree.generate_inclusion_proof(0).unwrap();
    let valid = tree.verify_inclusion_proof(0, b"alice:key1", &proof).unwrap();
    assert!(valid);

    let proof = tree.generate_inclusion_proof(2).unwrap();
    let valid = tree.verify_inclusion_proof(2, b"carol:key3", &proof).unwrap();
    assert!(valid);
}

#[test]
fn test_inclusion_proof_tamper_detection() {
    let mut tree = KeyTransparencyTree::new();
    tree.add_leaf(b"alice:key1").unwrap();
    tree.add_leaf(b"bob:key2").unwrap();

    let proof = tree.generate_inclusion_proof(0).unwrap();

    // Verify wrong entry — should return false
    let valid = tree
        .verify_inclusion_proof(0, b"alice:key_TAMPERED", &proof)
        .unwrap();
    assert!(!valid);
}

#[test]
fn test_single_leaf_tree() {
    let mut tree = KeyTransparencyTree::new();
    tree.add_leaf(b"only_entry").unwrap();

    let proof = tree.generate_inclusion_proof(0).unwrap();
    let valid = tree.verify_inclusion_proof(0, b"only_entry", &proof).unwrap();
    assert!(valid);
}

#[test]
fn test_sign_head() {
    let mut tree = KeyTransparencyTree::new();
    tree.add_leaf(b"entry1").unwrap();
    tree.add_leaf(b"entry2").unwrap();

    let (sth, verifying_key) = tree.sign_head().unwrap();
    assert_eq!(sth.tree_size, 2);
    assert_eq!(sth.root_hash, tree.root_hash().unwrap());

    // Verify the signature
    use ed25519_dalek::Verifier;
    let msg = [
        b"KT-v1".as_slice(),
        &sth.root_hash,
        &(sth.tree_size as u64).to_le_bytes(),
    ]
    .concat();
    assert!(verifying_key
        .verify(&msg, &ed25519_dalek::Signature::from_bytes(&sth.signature))
        .is_ok());
}

#[test]
fn test_consistency_proof() {
    let mut tree = KeyTransparencyTree::new();
    tree.add_leaf(b"entry1").unwrap();
    tree.add_leaf(b"entry2").unwrap();
    let old_root = tree.root_hash().unwrap();

    tree.add_leaf(b"entry3").unwrap();
    tree.add_leaf(b"entry4").unwrap();
    let new_root = tree.root_hash().unwrap();

    let proof = tree.generate_consistency_proof(2, 4).unwrap();
    assert_eq!(proof.old_tree_size, 2);
    assert_eq!(proof.new_tree_size, 4);

    let valid = KeyTransparencyTree::verify_consistency_proof(
        2, 4, &old_root, &new_root, &proof,
    )
    .unwrap();
    assert!(valid);
}
