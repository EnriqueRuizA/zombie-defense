'use strict';
// tests/rules.test.js — lote Oleada 1a (ADDENDUM 2026-10-15): spawn elegible +
// inmunidad solo-jugadores, anexión (cerco/partición), re-click refuerzo,
// retirada CA-P5, panel de región, dificultades, R-EXP, R-RES y R-BUNKER.
// Harness headless igual que pacing.test.js (setInterval capturado).
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');

require('../config.js');
const C = globalThis.SC_CONFIG;
const BAL = globalThis.SC_BALANCE;

globalThis.window = globalThis;
globalThis.requestAnimationFrame = function () { return 0; };
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let tickFn = null;
globalThis.setInterval = function (fn, ms) { if (ms === C.TICK_MS) tickFn = fn; return 1; };
globalThis.clearInterval = function () {};
require('../game.js');
after(function () {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});
const G = globalThis.SC_GAME;
// Ratio humano por defecto en cada test (pacing.test.js lo cambia globalmente
// al compartir proceso; ver runMatch): los comprometidos dependen de él.
before(() => { G.setAttackRatio(0.2); });
const W = C.MAP_W, H = C.MAP_H;
const IX = (x, y) => y * W + x;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function tickOne() {
  try { tickFn(); } catch (e) { if (!G.state().gameOver) throw e; }
}
function ticks(n) { for (let i = 0; i < n; i++) tickOne(); }
// Primera frontera neutral alcanzable desde la capital humana (BFS determinista).
function frontierTarget() {
  const d = G.debug();
  const grid = d.grid, terr = d.terrain, cap = d.players[0].capital;
  const seen = new Uint8Array(W * H);
  const start = cap.y * W + cap.x;
  seen[start] = 1;
  const q = [start];
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const cx = c % W, cy = (c / W) | 0;
    for (const dir of DIRS) {
      const nx = cx + dir[0], ny = cy + dir[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni] || terr[ni] === 3) continue;
      seen[ni] = 1;
      if (grid[ni] === -1) return { x: nx, y: ny };
      if (grid[ni] === 0) q.push(ni);
    }
  }
  return null;
}
function freeLandFarFromCaps(minDist) {
  const d = G.debug();
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (d.terrain[IX(x, y)] === 3 || d.grid[IX(x, y)] !== -1) continue;
    let ok = true;
    for (const p of d.players) {
      if (Math.hypot(x - p.capital.x, y - p.capital.y) < minDist) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return null;
}

// ---------- 1. Spawn elegible + inmunidad solo entre jugadores ----------

test('spawn: fase previa, humano elige punto en tierra libre, bots fijos', () => {
  G.newGame('terran', 1234);
  assert.equal(G.state().phase, 'spawn');
  const d0 = G.debug();
  assert.equal(d0.players[0].territory, 0, 'humano sin pintar hasta elegir');
  assert.ok(d0.players.slice(1).every(p => p.territory > 0), 'bots auto-spawn');
  const botCaps = d0.players.slice(1).map(p => ({ ...p.capital }));
  // Agua rechazada.
  let water = null;
  for (let i = 0; i < d0.terrain.length && !water; i++) {
    if (d0.terrain[i] === 3) water = { x: i % W, y: (i / W) | 0 };
  }
  assert.ok(water, 'hay agua en el mapa');
  assert.equal(G.chooseSpawn(0, water.x, water.y).ok, false);
  // Tierra libre aceptada (lejos de otros spawns).
  const spot = freeLandFarFromCaps(12);
  assert.ok(spot, 'hay tierra libre para spawn');
  assert.equal(G.chooseSpawn(0, spot.x, spot.y).ok, true);
  assert.deepEqual(G.debug().players[0].capital, spot);
  assert.ok(G.debug().players[0].territory > 0, 'capital pintada al elegir');
  // Cambiar de punto mueve la capital; bots intactos.
  const spot2 = freeLandFarFromCaps(12);
  if (spot2 && Math.hypot(spot2.x - spot.x, spot2.y - spot.y) > 4) {
    assert.equal(G.chooseSpawn(0, spot2.x, spot2.y).ok, true);
  }
  const d1 = G.debug();
  assert.deepEqual(d1.players.slice(1).map(p => ({ ...p.capital })), botCaps);
  // Cierre automático a los 100 ticks.
  ticks(C.SPAWN_PHASE_TICKS);
  assert.equal(G.state().phase, 'play');
  assert.equal(G.debug().players[0].confirmed, true);
});

test('spawn: sin elegir se confirma el candidato + inmunidad 50 ticks solo-jugadores', () => {
  G.newGame('zerg', 777);
  ticks(C.SPAWN_PHASE_TICKS); // cierre sin elegir
  const s = G.state();
  assert.equal(s.phase, 'play');
  assert.ok(s.players[0].territory > 0, 'candidato auto-confirmado');
  assert.equal(s.immune, true, 'inmunidad tras el cierre');
  ticks(C.SPAWN_IMMUNITY_TICKS);
  assert.equal(G.state().immune, false, 'la inmunidad expira a los 50 ticks');
  assert.equal(G.chooseSpawn(0, 10, 10).ok, false, 'spawn cerrado, sin cambios');
});

test('inmunidad: neutral conquistable, jugador bloqueado (sin daño)', () => {
  G.newGame('terran', 4242);
  G.closeSpawn();
  assert.equal(G.state().immune, true);
  // Neutral sí cae durante la inmunidad.
  const f = frontierTarget();
  assert.ok(f, 'hay frontera neutral');
  const t0 = G.debug().players[0].territory;
  assert.equal(G.launchAttack(0, f.x, f.y).ok, true);
  ticks(12);
  assert.ok(G.debug().players[0].territory > t0, 'neutral conquistable en inmunidad');
  // Jugador: sin conquista ni daño mientras dure (control sin ataque: el bot
  // gasta en su propia expansión; el daño NUESTRO es la diferencia, =0).
  function immunityProbe(launch) {
    G.newGame('terran', 4242);
    G.closeSpawn();
    const d = G.debug();
    d.players[0].troops = 20000;
    const prey = frontierTarget();
    d.grid[IX(prey.x, prey.y)] = 1;
    let committed = 0;
    if (launch) {
      assert.equal(G.launchAttack(0, prey.x, prey.y).ok, true);
      committed = G.debug().attacks.filter(a => a.owner === 0).slice(-1)[0].troops;
    }
    ticks(10);
    const dd = G.debug();
    const fr = dd.attacks.find(a => a.owner === 0);
    return { gridVal: dd.grid[IX(prey.x, prey.y)], botTroops: dd.players[1].troops, front: fr, committed };
  }
  const ctl = immunityProbe(false);
  const atk = immunityProbe(true);
  assert.equal(atk.gridVal, 1, 'en inmunidad no se conquista al jugador');
  // El bot SÍ reacciona (construye búnker bajo presión: -60/-80 de su pool);
  // daño de COMBATE nuestro = 0: la diferencia no supera un coste de búnker.
  assert.ok(atk.botTroops >= ctl.botTroops - 100, 'sin daño de combate (control=' +
    ctl.botTroops.toFixed(0) + ', ataque=' + atk.botTroops.toFixed(0) + ')');
  assert.ok(atk.front && atk.front.gained === 0 && atk.front.troops === atk.committed,
    'el frente espera intacto durante la inmunidad');
  // Tras la inmunidad el mismo frente progresa (partida nueva, mismo setup).
  G.newGame('terran', 4242);
  G.closeSpawn();
  const d3 = G.debug();
  d3.players[0].troops = 20000;
  const prey3 = frontierTarget();
  d3.grid[IX(prey3.x, prey3.y)] = 1;
  G.launchAttack(0, prey3.x, prey3.y);
  let took = false;
  for (let i = 0; i < 250 && !took; i++) {
    tickOne();
    if (G.debug().grid[IX(prey3.x, prey3.y)] === 0) took = true;
  }
  assert.ok(took, 'sin inmunidad el asalto superior conquista');
});

// ---------- 2. Anexión: cerco total y partición ----------

function forcePatch() {
  // Parche 9x9 neutral de llanura sin ciudades, lejos de capitales.
  const d = G.debug();
  let best = null, bestScore = -1;
  for (let y = 6; y < H - 7; y++) for (let x = 6; x < W - 7; x++) {
    let land = 0, city = false, far = true;
    for (const p of d.players) {
      if (Math.hypot(x - p.capital.x, y - p.capital.y) < 14) { far = false; break; }
    }
    if (!far) continue;
    for (let dy = -4; dy <= 4 && !city; dy++) for (let dx = -4; dx <= 4; dx++) {
      const ii = IX(x + dx, y + dy);
      if (d.terrain[ii] !== 3 && d.grid[ii] === -1) land++;
    }
    for (const c of d.cities) {
      if (Math.abs(c.x - x) <= 5 && Math.abs(c.y - y) <= 5) { city = true; break; }
    }
    if (!city && land > bestScore) { bestScore = land; best = { x, y }; }
  }
  assert.ok(best, 'hay parche para anexión');
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const ii = IX(best.x + dx, best.y + dy);
    d.terrain[ii] = 0; d.grid[ii] = -1;
  }
  return best;
}

test('anexión: cerco total de bolsón => cambio instantáneo sin pérdidas del defensor', () => {
  G.newGame('terran', 9001);
  G.closeSpawn();
  const c = forcePatch();
  const d = G.debug();
  d.grid[IX(c.x, c.y)] = 1;
  for (const dir of DIRS) d.grid[IX(c.x + dir[0], c.y + dir[1])] = 0;
  const tDef0 = d.players[1].troops;
  const flipped = G.checkAnnex(0, 1);
  assert.ok(flipped >= 1, 'el bolsón voltea, flipped=' + flipped);
  assert.equal(G.debug().grid[IX(c.x, c.y)], 0);
  assert.equal(G.debug().players[1].troops, tDef0, 'sin pérdidas del defensor');
  assert.ok(G.debug().players[1].alive, 'la víctima sobrevive (capital fuera)');
});

test('anexión: el bolsón CON costa (contacto con agua) NO voltea', () => {
  G.newGame('terran', 9003);
  G.closeSpawn();
  const c = forcePatch();
  const d = G.debug();
  // Bloque víctima 3x3 con agua ADYACENTE al norte; resto del anillo atacante.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    d.grid[IX(c.x + dx, c.y + dy)] = 1;
  }
  for (let dx = -1; dx <= 1; dx++) {
    d.terrain[IX(c.x + dx, c.y - 2)] = 3; d.grid[IX(c.x + dx, c.y - 2)] = -3;
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
    const ii = IX(c.x + dx, c.y + dy);
    if (d.terrain[ii] !== 3 && d.grid[ii] === -1) d.grid[ii] = 0;
  }
  const flipped = G.checkAnnex(0, 1);
  assert.equal(flipped, 0, 'con costa no hay anexión');
  assert.equal(G.debug().grid[IX(c.x, c.y)], 1, 'la víctima conserva el bolsón');
});

test('anexión: la capital NO voltea por cerco (exige asalto)', () => {
  G.newGame('terran', 9004);
  G.closeSpawn();
  const d = G.debug();
  const vc = { ...d.players[1].capital };
  // Anillo atacante alrededor de la 3x3 de la capital víctima (bolsón con
  // capital, sin costa): el anillo voltea pero el centro resiste.
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dx === 0 && dy === 0) continue;
    const ii = IX(vc.x + dx, vc.y + dy);
    d.terrain[ii] = 0;
    d.grid[ii] = 0;
  }
  d.grid[IX(vc.x, vc.y)] = 1;
  const flipped = G.checkAnnex(0, 1);
  assert.equal(G.debug().grid[IX(vc.x, vc.y)], 1, 'el centro resiste el cerco');
  assert.ok(G.debug().players[1].alive, 'sin eliminación instantánea');
});

test('anexión: partición en dos, el bolsón sin costa voltea entero', () => {
  G.newGame('terran', 9002);
  G.closeSpawn();
  const c = forcePatch();
  const d = G.debug();
  // Bloque víctima 5x5 con barra atacante en la fila central.
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    d.grid[IX(c.x + dx, c.y + dy)] = dy === 0 ? 0 : 1;
  }
  // Anillo atacante alrededor del bloque.
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 3 && Math.abs(dx) <= 2 && Math.abs(dy) <= 2) continue;
    if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) continue;
    const ii = IX(c.x + dx, c.y + dy);
    if (d.grid[ii] === -1) d.grid[ii] = 0;
  }
  const tDef0 = d.players[1].troops;
  const flipped = G.checkAnnex(0, 1);
  assert.equal(flipped, 20, 'las dos mitades (10+10) voltean, flipped=' + flipped);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dy === 0) continue;
    assert.equal(G.debug().grid[IX(c.x + dx, c.y + dy)], 0);
  }
  assert.equal(G.debug().players[1].troops, tDef0, 'sin pérdidas del defensor');
});

// ---------- 3. Re-click refuerzo + retirada CA-P5 + panel de región ----------

test('re-click sobre frente propio SUMA tropas (sin frente nuevo)', () => {
  G.newGame('protoss', 555);
  G.closeSpawn();
  const d = G.debug();
  d.players[0].troops = 5000;
  const f = frontierTarget();
  const r1 = G.launchAttack(0, f.x, f.y);
  assert.equal(r1.ok, true);
  const n0 = G.debug().attacks.filter(a => a.owner === 0).length;
  const front = G.debug().attacks.filter(a => a.owner === 0).slice(-1)[0];
  const tFront0 = front.troops;
  const r2 = G.launchAttack(0, front.cx, front.cy); // re-click en el cursor
  assert.equal(r2.ok, true);
  assert.equal(r2.reinforced, front.id);
  assert.equal(G.debug().attacks.filter(a => a.owner === 0).length, n0, 'sin frente nuevo');
  const back = G.debug().attacks.find(a => a.id === front.id);
  assert.ok(back.troops > tFront0, 'tropas sumadas al mismo frente');
});

test('CA-P5: retirada devuelve 75% vs jugador y 100% vs neutral', () => {
  // Salto de pool entre el tick 19 y 21 (la vuelta completa en el tick 20;
  // así el crecimiento logístico (~2-3/tick) no contamina la medida ni el cap).
  function refundJump(foe) {
    G.newGame('terran', 556);
    G.closeSpawn();
    const d = G.debug();
    d.players[0].troops = 600; // lejos del cap: la vuelta no trunca
    const f = frontierTarget();
    if (foe) d.grid[IX(f.x, f.y)] = 1;
    G.launchAttack(0, f.x, f.y);
    const fr = G.debug().attacks.filter(a => a.owner === 0).slice(-1)[0];
    assert.equal(!!fr.foe, foe);
    const c = fr.troops;
    G.retreatAttack(0, fr.id);
    ticks(15);
    const p15 = G.debug().players[0].troops;
    ticks(4); // la vuelta completa en el tick 20
    const pA = G.debug().players[0].troops;
    ticks(2);
    const pB = G.debug().players[0].troops;
    assert.ok(!G.debug().attacks.some(a => a.id === fr.id), 'el frente se va tras la demora');
    const g = (pA - p15) / 4; // crecimiento/tick medido (sin vuelta aún)
    return { net: (pB - pA) - 2 * g, committed: c }; // vuelta neta de crecimiento
  }
  const n = refundJump(false);
  const j = refundJump(true);
  console.log('CA-P5 neutral neto ' + n.net.toFixed(1) + '/' + n.committed + ', vs jugador ' + j.net.toFixed(1) + '/' + j.committed);
  assert.ok(Math.abs(n.net - n.committed) < 20, 'vs neutral vuelve ~100%');
  assert.ok(Math.abs(j.net - j.committed * 0.75) < 20, 'vs jugador vuelve ~75%');
  assert.ok((n.net - j.net) > n.committed * 0.15, 'diferencia jugador/neutral clara');
});

test('panel de región: ficha con dueño/defensa/terreno/ciudad/frente', () => {
  G.newGame('terran', 560);
  G.closeSpawn();
  const d = G.debug();
  let water = null;
  for (let i = 0; i < d.terrain.length && !water; i++) {
    if (d.terrain[i] === 3) water = { x: i % W, y: (i / W) | 0 };
  }
  const rw = G.regionInfo(water.x, water.y);
  assert.equal(rw.terrain, 'agua');
  const cap = d.players[0].capital;
  const rm = G.regionInfo(cap.x, cap.y);
  assert.match(rm.ownerName, /TÚ/);
  assert.ok(typeof rm.defense === 'number' && rm.defense > 0);
  assert.ok(['llanura', 'tierras altas', 'montaña'].includes(rm.terrain));
  const nc = d.cities.find(c => c.owner === -1);
  assert.ok(nc, 'hay ciudad neutral');
  const rc = G.regionInfo(nc.x, nc.y);
  assert.ok(rc.city && rc.city.includes('Ciudad'), 'ficha con ciudad: ' + rc.city);
  // Frente con ID en su cursor.
  d.players[0].troops = 5000;
  const f = frontierTarget();
  G.launchAttack(0, f.x, f.y);
  const fr = G.debug().attacks.filter(a => a.owner === 0).slice(-1)[0];
  const rf = G.regionInfo(fr.cx, fr.cy);
  assert.ok(rf.front && rf.front.id === fr.id, 'ficha con frente ID');
});

// ---------- 4. Dificultades ----------

test('dificultades en config y aplicadas a bots (cap/3, default Media)', () => {
  assert.deepEqual(C.DIFFICULTY.options, { facil: 0.5, media: 0.75, dificil: 1.0, imposible: 1.25 });
  assert.equal(C.DIFFICULTY.BOT_CAP_DIV, 3);
  assert.equal(C.DIFFICULTY.def, 'media');
  assert.equal(G.setDifficulty('orco').ok, false);
  assert.equal(G.setDifficulty('dificil').ok, true);
  G.newGame('terran', 600);
  G.closeSpawn(); // newGame relee dificultad solo con DOM; aquí queda la fijada
  G.setDifficulty('media');
  const s = G.state();
  assert.equal(s.difficulty, 'media');
  for (const p of s.players.filter(p => !G.debug().players[p.idx].isHuman)) {
    const dd = G.debug().players[p.idx];
    const expect = Math.round(BAL.maxTroops(dd.territory, dd.cities, dd.factionId) / 3);
    assert.equal(p.max, expect, 'bot J' + (p.idx + 1) + ' con cap/3');
  }
  const me = s.players[0], dm = G.debug().players[0];
  assert.equal(me.max, BAL.maxTroops(dm.territory, dm.cities, dm.factionId), 'humano a cap completo');
});

// ---------- 5. R-EXP superlineal ----------

test('R-EXP unit: potencia, pérdidas decrecientes, imperio y techo de frentes', () => {
  for (const t of [50, 100, 200, 400]) {
    const cells1 = t / BAL.expLossMult(t);
    const cells2 = (2 * t) / BAL.expLossMult(2 * t);
    assert.ok(cells2 / cells1 > 2, 'T=' + t + ': ratio ' + (cells2 / cells1).toFixed(2));
    assert.ok(BAL.expPower(2 * t, 100, 1) > BAL.expPower(t, 100, 1), 'potencia monótona');
  }
  assert.ok(BAL.expPower(200, 2000, 1) > BAL.expPower(200, 100, 1), 'el imperio suma potencia');
  assert.ok(BAL.frontCap(0) < BAL.frontCap(2000), 'el techo de frentes crece con territorio');
  assert.ok(BAL.frontCap(100000) <= C.MAX_ATTACKS_PER_PLAYER, 'cap duro intacto');
});

function buildCorridor() {
  // Pasillo recto de 62 celdas de llanura neutral con muros de agua: el frente
  // marcha determinista (una sola candidata por paso, sin efecto del rnd).
  // Bots vivos pero con tropas clavadas a 10 cada 5 ticks (sin frentes ni gasto).
  const d = G.debug();
  const cap = d.players[0].capital;
  let dir = 0;
  if (cap.x + 64 <= W) dir = 1;
  else if (cap.x - 64 >= 0) dir = -1;
  assert.ok(dir !== 0, 'sin sitio para el pasillo');
  const y = Math.max(3, Math.min(H - 4, cap.y));
  const x0 = cap.x + dir * 3;
  for (let i = 0; i < 62; i++) {
    const x = x0 + dir * i;
    for (let dy = -2; dy <= 2; dy++) {
      const ii = IX(x, y + dy);
      if (dy === 0) { d.terrain[ii] = 0; d.grid[ii] = -1; }
      else { d.terrain[ii] = 3; d.grid[ii] = -3; }
    }
  }
  for (let i = d.cities.length - 1; i >= 0; i--) {
    const c = d.cities[i];
    const inX = dir > 0 ? (c.x >= x0 && c.x < x0 + 62) : (c.x <= x0 && c.x > x0 - 62);
    if (inX && Math.abs(c.y - y) <= 2) d.cities.splice(i, 1);
  }
  return { tx: x0 + dir * 10, ty: y };
}

function expRun(seed, troops) {
  G.newGame('terran', seed);
  G.closeSpawn();
  const d = G.debug();
  d.players[0].troops = troops;
  const cor = buildCorridor();
  const r = G.launchAttack(0, cor.tx, cor.ty);
  assert.equal(r.ok, true, 'seed ' + seed + ': frente lanzado');
  const id = G.debug().attacks.filter(a => a.owner === 0).slice(-1)[0].id;
  let best = 0;
  for (let t = 1; t <= 300; t++) {
    if (t % 5 === 0) {
      const dd = G.debug();
      for (const p of dd.players) if (!p.isHuman) p.troops = 10; // bots congelados
    }
    tickOne();
    const a = G.debug().attacks.find(x => x.id === id);
    if (a) best = Math.max(best, a.gained);
  }
  return best;
}

test('CA-EXP: doble tropas => >2x celdas en 300 ticks (2 semillas, pasillo controlado)', () => {
  for (const seed of [1234, 777]) {
    const base = expRun(seed, 250); // comprometidas 50
    const dbl = expRun(seed, 500); // comprometidas 100
    console.log('CA-EXP seed ' + seed + ': base=' + base + ' doble=' + dbl);
    assert.ok(dbl > 2 * base, 'seed ' + seed + ': ' + dbl + ' no es >2x' + base);
  }
});

// ---------- 6. R-RES ----------

test('CA-RES: mapa 120x75 celda 8px, canvas 960x600, sin shadowBlur por celda', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  assert.equal(C.MAP_W, 120);
  assert.equal(C.MAP_H, 75);
  assert.equal(C.CELL_PX, 8);
  assert.equal(C.MAP_W * C.CELL_PX, 960);
  assert.equal(C.MAP_H * C.CELL_PX, 600);
  G.newGame('terran', 31);
  const d = G.debug();
  assert.equal(d.terrain.length, 120 * 75);
  let land = 0;
  for (let i = 0; i < d.terrain.length; i++) if (d.terrain[i] !== 3) land++;
  assert.ok(land > 5000, 'más tierra jugable que antes (4000 celdas totales): ' + land);
  const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  assert.ok(!/\.shadowBlur\s*=/.test(src), 'nada de shadowBlur por celda (perf)');
});

// ---------- 7. R-BUNKER ----------

test('R-BUNKER config: 3 niveles, rango 4/5/6, dps solo-tierra, HP por nivel', () => {
  for (const f of ['terran', 'zerg', 'protoss']) {
    const b = C.BUNKERS[f];
    assert.ok(b, 'búnker ' + f);
    assert.deepEqual(b.range, [4, 5, 6]);
    assert.ok(b.dps[2] > b.dps[0] && b.dps[0] > 0, 'dps L3>L1>0');
    assert.ok(b.hp[2] > b.hp[0], 'HP crece por nivel');
    assert.ok(b.cost > 0 && b.upgrades.length === 2, 'coste base + 2 mejoras en tropas');
    assert.ok(b.slow[2] >= b.slow[0], 'slow crece');
  }
  assert.equal(C.BUNKERS.terran.name, 'Bunker');
  assert.equal(C.BUNKERS.zerg.name, 'Sunken Colony');
  assert.match(C.BUNKERS.protoss.name, /Shield Battery/);
});

test('R-BUNKER: construir/mejorar con tropas, 1 por celda, solo propio', () => {
  G.newGame('terran', 700);
  G.closeSpawn();
  const d = G.debug();
  d.players[0].troops = 10000;
  const cap = d.players[0].capital;
  const pool0 = G.debug().players[0].troops;
  assert.equal(G.buildBunker(0, cap.x, cap.y).ok, true);
  assert.equal(G.debug().players[0].troops, pool0 - C.BUNKERS.terran.cost, 'cuesta tropas');
  assert.equal(G.buildBunker(0, cap.x, cap.y).ok, false, '1 por celda');
  const f = frontierTarget();
  assert.equal(G.buildBunker(0, f.x, f.y).ok, false, 'solo en territorio propio');
  assert.equal(G.upgradeBunker(0, cap.x, cap.y).ok, true);
  assert.equal(G.debug().bunkers[0].level, 2);
  assert.equal(G.upgradeBunker(0, cap.x, cap.y).ok, true);
  assert.equal(G.debug().bunkers[0].level, 3);
  assert.equal(G.upgradeBunker(0, cap.x, cap.y).ok, false, 'tope Nv3');
  assert.equal(G.upgradeBunker(0, f.x, f.y).ok, false, 'sin búnker propio aquí');
});

function bunkerDuel(seed, level) {
  // Frente enemigo congelado (cool alto, sin rnd) junto a búnker propio:
  // daño autónomo puro, sin órdenes del dueño del búnker.
  G.newGame('terran', seed);
  G.closeSpawn();
  const d = G.debug();
  d.players[0].troops = 100000;
  const cap = { ...d.players[0].capital };
  assert.equal(G.buildBunker(0, cap.x, cap.y).ok, true);
  for (let l = 1; l < level; l++) assert.equal(G.upgradeBunker(0, cap.x, cap.y).ok, true);
  G.debug().attacks.push({
    id: 9000 + level, owner: 1, state: 'advance',
    cx: cap.x + 2, cy: cap.y, tx: cap.x + 2, ty: cap.y,
    troops: 500, cool: 9999, retTreat: 0, gained: 0, slow: 0, foe: true
  });
  tickOne();
  const slowed = G.debug().attacks.find(a => a.id === 9000 + level).slow > 0;
  ticks(99);
  const a = G.debug().attacks.find(x => x.id === 9000 + level);
  return { left: a ? a.troops : 0, slowed };
}

test('CA-BUNKER: daño autónomo sin órdenes y L3>L1 medido', () => {
  const l1 = bunkerDuel(31337, 1);
  const l3 = bunkerDuel(31337, 3);
  console.log('CA-BUNKER L1 deja ' + l1.left.toFixed(1) + ', L3 deja ' + l3.left.toFixed(1));
  assert.ok(l1.left < 500, 'L1 daña sin órdenes (' + l1.left.toFixed(1) + ')');
  assert.ok(l3.left < l1.left - 50, 'L3 >> L1 (' + l3.left.toFixed(1) + ' vs ' + l1.left.toFixed(1) + ')');
  assert.ok(l1.slowed, 'el búnker ralentiza (slow aplicado)');
});

test('CA-BUNKER: bots con >=1 búnker bajo presión', () => {
  G.newGame('terran', 808);
  G.closeSpawn();
  const d = G.debug();
  const victim = 2;
  const vc = { ...d.players[victim].capital };
  // Presión real: frente humano (congelado, sin conquistar) sobre su capital.
  G.debug().attacks.push({
    id: 7777, owner: 0, state: 'advance',
    cx: vc.x + 3, cy: vc.y, tx: vc.x, ty: vc.y,
    troops: 5000, cool: 9999, retTreat: 0, gained: 0, slow: 0, foe: true
  });
  for (let t = 1; t <= 400; t++) tickOne();
  const n = G.debug().bunkers.filter(b => b.owner === victim).length;
  assert.ok(n >= 1, 'el bot bajo presión construyó búnker (tiene ' + n + ')');
});
