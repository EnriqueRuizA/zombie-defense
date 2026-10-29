'use strict';
// Lógica pura de sala (sin sockets): la usan server.js y los tests.
// Protocolo v0 — ver server/protocol.md.
var MAX_SLOTS = 4;
var FACTIONS = { terran: 1, zerg: 1, protoss: 1 };
var MAX_LOG = 5000;

function createRoom(code, seed) {
  var n = seed | 0;
  if (n === 0) n = 1;
  return { code: String(code ?? '').toUpperCase().slice(0, 8), seed: n, tick: 0, slots: [null, null, null, null], log: [] };
}

function freeSlot(room) {
  for (var i = 0; i < MAX_SLOTS; i++) if (!room.slots[i]) return i;
  return -1;
}

function validNick(nick) {
  return typeof nick === 'string' && nick.trim().length >= 1 && nick.trim().length <= 16;
}

function joinRoom(room, nick, faction) {
  nick = typeof nick === 'string' ? nick.trim() : '';
  if (!validNick(nick)) return { ok: false, reason: 'nick 1-16 caracteres' };
  if (!FACTIONS[faction]) return { ok: false, reason: 'facción inválida' };
  for (var i = 0; i < MAX_SLOTS; i++) {
    if (room.slots[i] && room.slots[i].nick.toLowerCase() === nick.toLowerCase()) return { ok: false, reason: 'nick en uso' };
  }
  var s = freeSlot(room);
  if (s < 0) return { ok: false, reason: 'sala llena (4/4)' };
  room.slots[s] = { nick: nick, faction: faction, alive: true };
  return { ok: true, slot: s };
}

function leaveRoom(room, slot) {
  if (slot < 0 || slot >= MAX_SLOTS || !room.slots[slot]) return { ok: false, reason: 'slot vacío' };
  room.slots[slot] = null;
  return { ok: true };
}

function validAction(a) {
  if (!a || typeof a.k !== 'string') return 'acción sin tipo';
  if (a.k === 'attack' || a.k === 'fighter' || a.k === 'aa') {
    if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return 'coords enteras';
    if (a.x < 0 || a.y < 0 || a.x >= 80 || a.y >= 50) return 'coords fuera de mapa';
    return null;
  }
  if (a.k === 'retreat' || a.k === 'ready') return null;
  return 'tipo desconocido: ' + a.k;
}

function applyInput(room, slot, tick, action) {
  if (slot < 0 || slot >= MAX_SLOTS || !room.slots[slot]) return { ok: false, reason: 'slot vacío' };
  if (!Number.isInteger(tick) || tick < room.tick - 2) return { ok: false, reason: 'tick tardío' };
  var err = validAction(action);
  if (err) return { ok: false, reason: err };
  room.log.push({ slot: slot, tick: tick, action: action });
  if (room.log.length > MAX_LOG) room.log.splice(0, room.log.length - MAX_LOG);
  return { ok: true, n: room.log.length };
}

function roster(room) {
  return room.slots.map(function (s, i) { return s ? { slot: i, nick: s.nick, faction: s.faction, alive: s.alive } : null; });
}

function snapshot(room) {
  return { code: room.code, tick: room.tick, seed: room.seed, slots: roster(room), logLen: room.log.length };
}

module.exports = { MAX_SLOTS: MAX_SLOTS, createRoom: createRoom, joinRoom: joinRoom, leaveRoom: leaveRoom, applyInput: applyInput, roster: roster, snapshot: snapshot, validAction: validAction };
