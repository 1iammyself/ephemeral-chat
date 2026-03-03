// olmHelper.js - Olm encryption/decryption for chat messages
// Apache 2.0 License

import Olm from 'olm';

let account;
let session;

export async function initOlm() {
  await Olm.init();
  account = new Olm.Account();
  account.create();
}

export function getIdentityKeys() {
  return account.identity_keys();
}

export function generateOneTimeKeys(count = 1) {
  account.generate_one_time_keys(count);
  return account.one_time_keys();
}

export function markKeysAsPublished() {
  account.mark_keys_as_published();
}

export function createOutboundSession(theirIdentityKey, theirOneTimeKey) {
  session = new Olm.Session();
  session.create_outbound(account, theirIdentityKey, theirOneTimeKey);
}

export function createInboundSession(message) {
  session = new Olm.Session();
  session.create_inbound(account, message);
}

export function encryptOlmMessage(plaintext) {
  return session.encrypt(plaintext);
}

export function decryptOlmMessage(message) {
  return session.decrypt(message.type, message.body);
}

export function pickleOlmSession(key) {
  return session.pickle(key);
}

export function unpickleOlmSession(key, pickle) {
  session = new Olm.Session();
  session.unpickle(key, pickle);
}
