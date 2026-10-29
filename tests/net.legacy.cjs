'use strict';
// tests/net.test.js — puerta oleada 0: lógica de sala + codec WS. Sin sockets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ROOM = require('../server/room.cjs');
const WS = require('../server/ws.cjs');

test('sala: join asigna slots 0-3 y rechaza el 5º', () => {
  const r = ROOM.createRoom('SC-1', 42);
  const factions = ['terran', 'zerg', 'protoss', 'terran'];
  for (let i = 0; i < 4; i++) {
    const res = ROOM.joinRoom(r, 'P' + i, factions[i]);
    assert.equal(res.ok, true); assert.equal(res.slot, i);
  }
  assert.match(ROOM.joinRoom(r, 'Extra', 'zerg').reason, /llena/);
});

test('sala: valida nick, facción y duplicados; leave libera', () => {
  const r = ROOM.createRoom('SC-2', 7);
  assert.equal(ROOM.joinRoom(r, '', 'terran').ok, false);
  assert.equal(ROOM.joinRoom(r, 'Alguien', 'orco').ok, false);
  assert.equal(ROOM.joinRoom(r, 'Alfa', 'terran').ok, true);
  assert.match(ROOM.joinRoom(r, 'alfa', 'zerg').reason, /uso/);
  assert.equal(ROOM.leaveRoom(r, 0).ok, true);
  assert.equal(ROOM.joinRoom(r, 'Beta', 'zerg').ok, true);
  assert.equal(ROOM.roster(r).filter(Boolean).length, 1);
});

test('inputs: valida forma, rango y tick tardío; log con cap', () => {
  const r = ROOM.createRoom('SC-3', 9);
  ROOM.joinRoom(r, 'A', 'terran');
  assert.equal(ROOM.applyInput(r, 0, 0, { k: 'attack', x: 10, y: 10 }).ok, true);
  // R-RES: y=99 fuera del mapa nuevo 120x75 (el vector viejo x=99/y=10 quedo en rango)
  assert.equal(ROOM.applyInput(r, 0, 0, { k: 'attack', x: 99, y: 99 }).ok, false);
  assert.equal(ROOM.applyInput(r, 0, 0, { k: 'nuke' }).ok, false);
  assert.equal(ROOM.applyInput(r, 3, 0, { k: 'ready' }).ok, false); // slot vacío
  r.tick = 10;
  assert.equal(ROOM.applyInput(r, 0, 0, { k: 'ready' }).ok, false); // tardío
  assert.equal(ROOM.applyInput(r, 0, 9, { k: 'ready' }).ok, true);
  const s = ROOM.snapshot(r);
  assert.equal(s.code, 'SC-3'); assert.equal(s.logLen, 2);
});

test('sala: reentrada en sala avanzada usa el tick vigente (regresión puerta 2 pasadas)', () => {
  const r = ROOM.createRoom('SC-RE', 5);
  ROOM.joinRoom(r, 'A', 'terran');
  ROOM.joinRoom(r, 'B', 'zerg');
  r.tick = 37; // sala que ya lleva rato (segunda pasada de la puerta)
  assert.equal(ROOM.snapshot(r).tick, 37); // el cliente puede leerlo (joined {tick})
  // cliente base su input en el tick vigente recibido al entrar
  assert.equal(ROOM.applyInput(r, 0, 37, { k: 'attack', x: 5, y: 5 }).ok, true);
  // el reloj avanza mientras el input viaja: sigue siendo válido
  assert.equal(ROOM.applyInput(r, 1, 38, { k: 'ready' }).ok, true);
  // tick fijo 0 (bug previo) se rechaza como tardío
  assert.match(ROOM.applyInput(r, 0, 0, { k: 'ready' }).reason, /tardío/);
});

test('ws: vector RFC6455 del handshake', () => {
  assert.equal(WS.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('ws: roundtrip encode→decode con máscara (corto, medio y largo)', () => {
  for (const msg of ['{"t":"ping"}', 'x'.repeat(200), 'y'.repeat(70000)]) {
    const enc = WS.encodeText(msg, true);
    const dec = WS.decodeFrames(enc);
    assert.equal(dec.frames.length, 1);
    assert.equal(dec.frames[0], msg);
    assert.equal(dec.rest.length, 0);
  }
});

test('ws: dos frames pegados + close', () => {
  const a = WS.encodeText('{"t":"a"}', true);
  const b = WS.encodeText('{"t":"b"}', true);
  const dec = WS.decodeFrames(Buffer.concat([a, b]));
  assert.deepEqual(dec.frames, ['{"t":"a"}', '{"t":"b"}']);
  const dec2 = WS.decodeFrames(WS.encodeClose());
  assert.equal(dec2.closed, true);
});
