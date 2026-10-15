'use strict';
// tests/determinism.test.js — misma semilla ⇒ mismo mapa; sin Math.random en sim.
// Carga game.js headless con stubs mínimos (sin DOM): la guardia typeof document lo permite.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../config.js');
const C = globalThis.SC_CONFIG; // R-RES: dims del mapa para la auditoría
globalThis.window = globalThis;
globalThis.requestAnimationFrame = function () { return 0; };
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = function () { return 0; }; // la sim solo avanza bajo control
require('../game.js');
// Mantener el stub durante los tests headless: newGame() programa el loop con
// setInterval y los timers reales dejarían el runner colgado. Se restaura al final.
after(function () { globalThis.setInterval = realSetInterval; });
const G = globalThis.SC_GAME;

test('misma semilla ⇒ mismo mapa y misma seed almacenada', () => {
  G.newGame('terran', 1234);
  const h1 = G.mapHash();
  G.newGame('terran', 1234);
  const h2 = G.mapHash();
  assert.equal(G.getSeed(), 1234);
  assert.match(h1, /^[0-9a-f]{8}$/);
  assert.equal(h1, h2);
});

test('semilla distinta ⇒ mapa distinto', () => {
  G.newGame('terran', 1234);
  const h1 = G.mapHash();
  G.newGame('terran', 999991);
  const h2 = G.mapHash();
  assert.notEqual(h1, h2);
});

test('cero Math.random en sim (solo fallback de semilla aleatoria)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const hits = [];
  src.split('\n').forEach(function (line, i) {
    if (line.includes('Math.random')) hits.push(i + 1 + ': ' + line.trim());
  });
  assert.ok(hits.length <= 1, 'Math.random inesperados: ' + JSON.stringify(hits));
  if (hits.length === 1) assert.match(hits[0], /seedOpt/);
});

test('QD-001: pausa+reinicio no duplican el intervalo de sim', () => {
  const savedSet = globalThis.setInterval, savedClear = globalThis.clearInterval;
  const active = {};
  let next = 1;
  globalThis.setInterval = function () { const id = next++; active[id] = true; return id; };
  globalThis.clearInterval = function (id) { delete active[id]; };
  try {
    G.newGame('terran', 777);
    assert.equal(Object.keys(active).length, 1, 'newGame programa 1 timer');
    G.pauseGame();
    assert.equal(Object.keys(active).length, 0, 'pausa limpia el timer');
    assert.equal(G.isPaused(), true);
    G.newGame('terran', 778); // reinicio en pausa (repro QD-001 paso 3)
    assert.equal(G.isPaused(), false, 'newGame resetea pausa');
    assert.equal(Object.keys(active).length, 1, 'reinicio deja 1 timer');
    G.pauseGame();
    G.resumeGame();
    assert.equal(Object.keys(active).length, 1, 'resume deja 1 timer');
    G.resumeGame(); // resume sin clear previo duplicaba (repro paso 4)
    assert.equal(Object.keys(active).length, 1, 'doble resume no duplica');
    G.pauseGame();
    assert.equal(Object.keys(active).length, 0);
  } finally {
    globalThis.setInterval = savedSet;
    globalThis.clearInterval = savedClear;
  }
});

function waterAudit(G, seed) {
  G.newGame('terran', seed);
  const d = G.debug();
  const t = d.terrain, W = C.MAP_W, H = C.MAP_H; // R-RES: dims desde config (era 80x50)
  let water = 0;
  for (let i = 0; i < t.length; i++) if (t[i] === 3) water++;
  const comp = new Int32Array(t.length).fill(-1);
  const sizes = [];
  let cid = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== 3 || comp[i] !== -1) continue;
    const q = [i]; comp[i] = cid; let sz = 0, head = 0;
    while (head < q.length) {
      const c = q[head++]; sz++;
      const cx = c % W, cy = (c / W) | 0;
      const nb = [];
      if (cx > 0) nb.push(c - 1);
      if (cx < W - 1) nb.push(c + 1);
      if (cy > 0) nb.push(c - W);
      if (cy < H - 1) nb.push(c + W);
      for (const m of nb) if (t[m] === 3 && comp[m] === -1) { comp[m] = cid; q.push(m); }
    }
    sizes.push(sz); cid++;
  }
  sizes.sort((a, b) => b - a);
  const mayor = sizes.length ? sizes[0] : 0;
  const capsLand = d.players.every((p) => t[p.capital.y * W + p.capital.x] !== 3);
  return { seed, water, pct: water / t.length * 100, lakes: sizes.length, mayor, mayorPct: water ? mayor / water * 100 : 0, capsLand, hash: G.mapHash() };
}

test('QD-002/QD-003: 8 semillas QA con agua 15-40%, mayor>=60% y capitales en tierra', () => {
  for (const s of [777, 1234, 999991, 42, 7, 2024, 31337, 100]) {
    const a = waterAudit(G, s);
    assert.ok(a.pct >= 15 && a.pct <= 40, `seed ${s}: water%=${a.pct.toFixed(1)}`);
    assert.ok(a.mayorPct >= 60, `seed ${s}: mayor=${a.mayorPct.toFixed(1)}% (lagos=${a.lakes})`);
    assert.equal(a.capsLand, true, `seed ${s}: capitales en tierra`);
  }
});

test('QD-002/QD-003: determinismo intacto tras el post-procesado', () => {
  const a1 = waterAudit(G, 1234), a2 = waterAudit(G, 1234);
  assert.equal(a1.hash, a2.hash);
  const b = waterAudit(G, 999991);
  assert.notEqual(a1.hash, b.hash);
});

test('ataque terrestre headless responde (no excepción, mundo válido)', () => {
  G.newGame('zerg', 555);
  G.closeSpawn(); // lote 1a: el humano no pinta hasta el cierre del spawn
  const d = G.debug();
  const cap = d.players[0].capital;
  const res = G.tryGroundAttack(0, cap.x + 3, cap.y);
  assert.equal(typeof res.ok, 'boolean');
  assert.ok(d.players.every(function (p) { return p.territory > 0; }));
  assert.equal(G.state().cities, d.cities.length);
});
