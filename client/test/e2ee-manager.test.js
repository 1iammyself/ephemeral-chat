/**
 * E2EE orchestration (e2ee-manager.js) — full handshake ceremony.
 *
 * Drives the REAL manager (PQXDH + Double Ratchet for 1:1, Megolm sender keys
 * for groups) over a mock socket bus that mirrors the server's relay handlers
 * (server/index.js: register-public-key, request-key-bundles, key-bundle-roster,
 * peer-key-bundle, key-bundle-offer, key-bundle-answer, sender-key-distribution).
 *
 * This pins the client↔server wiring contract — event names and payload field
 * transforms (`to` → `from`, etc.). If they drift, the ceremony stops completing
 * and these tests fail (the Privacy Pass failure mode, caught here instead).
 *
 * Isolation trick: the manager keys all state by roomCode, so each simulated
 * party gets its OWN roomCode and the bus rewrites `roomCode` to the recipient's
 * on delivery — letting two/three independent "clients" coexist in one process.
 *
 * RUN: node --test client/test/e2ee-manager.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initE2EE,
  isE2EEReady,
  encryptE2EE,
  decryptE2EE,
  destroyE2EESession,
} from '../src/crypto/e2ee-manager.js';
import {
  registerE2EEManager,
  encryptMLSMessage,
  decryptMLSMessage,
  initRoomEncryption,
  setSizePadding,
} from '../src/utils/aesEncryption.js';

// Wire the routing layer exactly as security.js does in the app, so
// encryptMLSMessage/decryptMLSMessage (the ChatRoom entry points) route to the
// real manager when a session is ready and fall back to v4 AES otherwise.
registerE2EEManager({ isE2EEReady, encryptE2EE, decryptE2EE });

/**
 * Mock bus mirroring the server's E2EE relay. Each client has a distinct
 * roomCode; the bus rewrites `roomCode` to the recipient's on every delivery
 * so the manager's `rc !== roomCode` guards pass.
 */
class MockBus {
  constructor() {
    this.clients = [];
    this.queue = [];
  }

  /** Create a socketManager-like client in logical room `room`. */
  addClient({ id, roomCode, room }) {
    const handlers = new Map();
    const bus = this;
    const sm = {
      socket: { id },
      on(ev, fn) {
        if (!handlers.has(ev)) handlers.set(ev, []);
        handlers.get(ev).push(fn);
      },
      off(ev, fn) {
        const a = handlers.get(ev);
        if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
      },
      emit(ev, payload) { bus._relay(id, ev, payload); },
    };
    this.clients.push({ id, roomCode, room, sm, handlers, bundle: null });
    return sm;
  }

  _client(id) { return this.clients.find((c) => c.id === id); }

  _peers(room, exceptId) {
    return this.clients.filter((c) => c.room === room && c.id !== exceptId);
  }

  /** Enqueue delivery, rewriting roomCode to the recipient's own. */
  _deliver(toId, ev, payload) {
    const c = this._client(toId);
    if (!c) return;
    const rewritten = 'roomCode' in payload ? { ...payload, roomCode: c.roomCode } : payload;
    for (const fn of c.handlers.get(ev) || []) this.queue.push(() => fn(rewritten));
  }

  /** Server-side relay logic (mirrors server/index.js handlers). */
  _relay(fromId, ev, payload) {
    const from = this._client(fromId);
    if (!from) return;

    if (ev === 'register-public-key') {
      from.bundle = payload.bundle;
      for (const p of this._peers(from.room, fromId)) {
        this._deliver(p.id, 'peer-key-bundle', { socketId: fromId, bundle: payload.bundle, roomCode: '_' });
      }
    } else if (ev === 'request-key-bundles') {
      const bundles = this._peers(from.room, fromId)
        .filter((p) => p.bundle)
        .map((p) => ({ socketId: p.id, bundle: p.bundle }));
      this._deliver(fromId, 'key-bundle-roster', { bundles, roomCode: '_' });
    } else if (ev === 'key-bundle-offer') {
      const { to, alicePublicBundle, pqCiphertext } = payload;
      if (to && alicePublicBundle) {
        this._deliver(to, 'key-bundle-offer', { from: fromId, alicePublicBundle, pqCiphertext, roomCode: '_' });
      }
    } else if (ev === 'key-bundle-answer') {
      if (payload.to) this._deliver(payload.to, 'key-bundle-answer', { from: fromId, roomCode: '_' });
    } else if (ev === 'sender-key-distribution') {
      const { to, encryptedKeyDist } = payload;
      if (to && encryptedKeyDist) {
        this._deliver(to, 'sender-key-distribution', { from: fromId, encryptedKeyDist, roomCode: '_' });
      }
    }
  }

  /** Simulate a peer leaving: the server notifies the rest of the room. */
  peerLeft(room, leaverId) {
    for (const p of this._peers(room, leaverId)) {
      this._deliver(p.id, 'peer-left', { socketId: leaverId, roomCode: '_' });
    }
  }

  /** Process queued deliveries until quiescent (models async network settling). */
  async settle() {
    let guard = 0;
    while (this.queue.length) {
      const task = this.queue.shift();
      await task();
      if (++guard > 100000) throw new Error('bus settle overflow — handshake loop?');
    }
  }
}

let roomSeq = 0;
const freshRoom = () => `R${roomSeq++}`;

// The handshake must work no matter which peer holds the smaller socket id —
// real ids are random. Regression guard: an earlier version had the existing
// member ALSO initiate when its id sorted below the joiner, producing two
// initiators, no responder, and an undecryptable session (broke ~50% of pairs).
for (const [firstId, secondId] of [['z-first', 'a-second'], ['a-first', 'z-second']]) {
  test(`E2EE: 1:1 ceremony works with socket ids ${firstId} / ${secondId}`, async () => {
    const bus = new MockBus();
    const tag = freshRoom();
    const room1 = `${tag}-1`;
    const room2 = `${tag}-2`;
    const sm1 = bus.addClient({ id: firstId, roomCode: room1, room: tag });
    const sm2 = bus.addClient({ id: secondId, roomCode: room2, room: tag });

    await initE2EE(room1, sm1); await bus.settle();
    await initE2EE(room2, sm2); await bus.settle();

    assert.equal(isE2EEReady(room1), true);
    assert.equal(isE2EEReady(room2), true);

    // The initiator (smaller socket id) must send first; the responder can only
    // send once it has received a message (standard Double Ratchet).
    const initiatorRoom = firstId < secondId ? room1 : room2;
    const responderRoom = firstId < secondId ? room2 : room1;

    const m1 = await encryptE2EE('hello 🔐', initiatorRoom);
    assert.equal(m1.v, 5);
    assert.ok(m1.dr, '1:1 should use the Double Ratchet path');
    assert.equal(await decryptE2EE(m1, responderRoom), 'hello 🔐');

    const m2 = await encryptE2EE('reply', responderRoom);
    assert.equal(await decryptE2EE(m2, initiatorRoom), 'reply');

    destroyE2EESession(room1);
    destroyE2EESession(room2);
  });
}

test('E2EE: not ready and encrypt refuses before any peer connects', async () => {
  const bus = new MockBus();
  const room = freshRoom();
  const soloRoom = `${room}-solo`;
  const soloSM = bus.addClient({ id: 'solo', roomCode: soloRoom, room });

  await initE2EE(soloRoom, soloSM);
  await bus.settle();

  assert.equal(isE2EEReady(soloRoom), false, 'no peer → not ready (caller falls back to v4)');
  await assert.rejects(() => encryptE2EE('nope', soloRoom), /No sessions/);

  destroyE2EESession(soloRoom);
});

test('E2EE: 3-party group uses sender keys; both peers decrypt', async () => {
  const bus = new MockBus();
  const room = freshRoom();
  // Sender (third joiner) gets the smallest id so the two existing members do
  // NOT tie-break initiate to it — the third becomes initiator to both and thus
  // has the send chains needed to distribute its sender key.
  const fRoom = `${room}-f`;
  const sRoom = `${room}-s`;
  const tRoom = `${room}-t`;
  const fSM = bus.addClient({ id: 'm2-first', roomCode: fRoom, room });
  const sSM = bus.addClient({ id: 'm1-second', roomCode: sRoom, room });
  const tSM = bus.addClient({ id: 'a0-third', roomCode: tRoom, room });

  await initE2EE(fRoom, fSM); await bus.settle();
  await initE2EE(sRoom, sSM); await bus.settle();
  await initE2EE(tRoom, tSM); await bus.settle();

  assert.equal(isE2EEReady(fRoom), true);
  assert.equal(isE2EEReady(sRoom), true);
  assert.equal(isE2EEReady(tRoom), true);

  // The third party sends a group message: first call generates + distributes
  // its sender key over the DR channels, then encrypts via Megolm.
  const payload = await encryptE2EE('group hello, everyone', tRoom);
  assert.equal(payload.v, 5);
  assert.ok(payload.sk, 'group room should use the sender-key (Megolm) path');

  // Deliver the sender-key distributions before decrypting.
  await bus.settle();

  assert.equal(await decryptE2EE(payload, fRoom), 'group hello, everyone');
  assert.equal(await decryptE2EE(payload, sRoom), 'group hello, everyone');

  destroyE2EESession(fRoom);
  destroyE2EESession(sRoom);
  destroyE2EESession(tRoom);
});

test('E2EE routing: encryptMLSMessage falls back to v4 AES when no session', async () => {
  const room = `routing-v4-${freshRoom()}`;
  await initRoomEncryption(room);

  const payload = await encryptMLSMessage('plain fallback', room);
  assert.equal(payload.v, 4, 'no E2EE session → v4 AES fallback');
  assert.equal(await decryptMLSMessage(payload, room), 'plain fallback');
});

test('E2EE routing: encryptMLSMessage uses v5 once a session is ready', async () => {
  const bus = new MockBus();
  const tag = freshRoom();
  const r1 = `${tag}-1`;
  const r2 = `${tag}-2`;
  const sm1 = bus.addClient({ id: 'a-init', roomCode: r1, room: tag }); // smaller id → initiator
  const sm2 = bus.addClient({ id: 'z-resp', roomCode: r2, room: tag });

  await initE2EE(r1, sm1); await bus.settle();
  await initE2EE(r2, sm2); await bus.settle();
  assert.equal(isE2EEReady(r1), true);

  const payload = await encryptMLSMessage('secret via routing', r1);
  assert.equal(payload.v, 5, 'ready session → routes to v5 E2EE');
  assert.equal(await decryptMLSMessage(payload, r2), 'secret via routing');

  destroyE2EESession(r1);
  destroyE2EESession(r2);
});

test('E2EE routing: decryptMLSMessage reports legacy v3 messages clearly', async () => {
  const out = await decryptMLSMessage({ v: 3, mls: true }, 'any-room');
  assert.match(out, /old protocol/i);
});

test('E2EE routing: size padding round-trips a v5 message and is transparent to the manager', async () => {
  const bus = new MockBus();
  const tag = freshRoom();
  const r1 = `${tag}-1`;
  const r2 = `${tag}-2`;
  const sm1 = bus.addClient({ id: 'a-init', roomCode: r1, room: tag });
  const sm2 = bus.addClient({ id: 'z-resp', roomCode: r2, room: tag });
  await initE2EE(r1, sm1); await bus.settle();
  await initE2EE(r2, sm2); await bus.settle();

  try {
    setSizePadding(true);
    const payload = await encryptMLSMessage('padded v5 message', r1);
    assert.equal(payload.v, 5);
    assert.equal(payload.p, 1, 'v5 payload is size-padded + marked');
    assert.ok(payload.dr, 'still a Double Ratchet payload under the padding');
    // decrypt strips the padding before handing the real ct to the manager
    assert.equal(await decryptMLSMessage(payload, r2), 'padded v5 message');
  } finally {
    setSizePadding(false);
  }

  destroyE2EESession(r1);
  destroyE2EESession(r2);
});

test('E2EE: group rekeys when a member leaves; remaining peers keep decrypting', async () => {
  const bus = new MockBus();
  const tag = freshRoom();
  // The sender has the smallest id → initiator to all → holds the send chains
  // needed to distribute (and later redistribute) its sender key.
  const parties = [
    { id: 'a-sender', room: `${tag}-snd` },
    { id: 'b-stay-1', room: `${tag}-s1` },
    { id: 'c-stay-2', room: `${tag}-s2` },
    { id: 'd-leaver', room: `${tag}-lv` },
  ];
  const sms = parties.map((p) => bus.addClient({ id: p.id, roomCode: p.room, room: tag }));
  for (let i = 0; i < parties.length; i++) {
    await initE2EE(parties[i].room, sms[i]);
    await bus.settle();
  }

  const senderRoom = parties[0].room;

  // Group message before the leave — everyone else decrypts it.
  const before = await encryptE2EE('before leave', senderRoom);
  await bus.settle();
  assert.ok(before.sk, 'group room should use the sender-key path');
  for (const p of parties.slice(1)) {
    assert.equal(await decryptE2EE(before, p.room), 'before leave');
  }

  // 'd-leaver' leaves → server notifies the room → sender rotates + redistributes.
  bus.peerLeft(tag, 'd-leaver');
  await bus.settle();

  // Two peers still remain (group), so the sender keeps using sender keys; the
  // rotated key was distributed during the leave, so the stayers still decrypt.
  const after = await encryptE2EE('after leave', senderRoom);
  await bus.settle();
  assert.equal(await decryptE2EE(after, parties[1].room), 'after leave');
  assert.equal(await decryptE2EE(after, parties[2].room), 'after leave');

  for (const p of parties) destroyE2EESession(p.room);
});
