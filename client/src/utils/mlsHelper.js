// mlsHelper.js - Messaging Layer Security (MLS) for chat messages
// Uses ts-mls (MIT/Apache license)

import { Group, KeyPackage, CipherSuite } from 'ts-mls';

let group;
let myKeyPackage;

export async function initMLS(userId) {
  // Choose a cipher suite (X25519 + Ed25519 + AES-GCM)
  const suite = CipherSuite.X25519_AES128GCM_SHA256_Ed25519;
  myKeyPackage = await KeyPackage.generate(suite, userId);
  group = await Group.create(suite, myKeyPackage);
}

export function getKeyPackage() {
  return myKeyPackage;
}

export async function addMember(theirKeyPackage) {
  await group.addMember(theirKeyPackage);
}

export async function encryptMLSMessage(plaintext) {
  return await group.encrypt(plaintext);
}

export async function decryptMLSMessage(ciphertext) {
  return await group.decrypt(ciphertext);
}

export function getGroupState() {
  return group.exportState();
}

export function importGroupState(state) {
  group = Group.importState(state);
}
