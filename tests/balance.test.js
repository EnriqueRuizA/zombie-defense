// tests/balance.test.js v2 — node --test nativo. Valida balance + reglas OpenFront sin DOM.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../config.js');
const C = globalThis.SC_CONFIG;
const BAL = globalThis.SC_BALANCE;

test('AA barata corto alcance (solo-aire)', () => {
  const cheapestFighter = Math.min(...Object.values(C.AIR_UNITS).map(u => u.cost));
  for (const f of Object.keys(C.AA_BUILDINGS)) {
    const aa = BAL.aaOf(f, C.FACTIONS[f]);
    assert.ok(aa.cost <= 65, `${f} AA cuesta ${aa.cost}`);
    assert.ok(aa.cost < cheapestFighter * 0.6, `${f} AA ${aa.cost} vs caza ${cheapestFighter}`);
    assert.equal(C.AA_BUILDINGS[f].range, 5);
    assert.ok(aa.dps > 0 && aa.hp <= 60);
  }
  assert.ok(5 < C.MAP_W / 8);
});

test('jerarquía facciones + escudo protoss', () => {
  assert.ok(C.FACTIONS.zerg.genMult > C.FACTIONS.protoss.genMult);
  const ratio = C.FACTIONS.zerg.genMult / C.FACTIONS.protoss.genMult;
  assert.ok(ratio > 1.4 && ratio < 1.8, `ratio ${ratio}`);
  assert.ok(C.FACTIONS.protoss.atkMult > C.FACTIONS.zerg.atkMult);
  assert.equal(BAL.resolveGroundAssault(100, 100, 'protoss'), false);
  assert.equal(BAL.resolveGroundAssault(130, 100, 'protoss'), true);
  assert.equal(BAL.resolveGroundAssault(100, 90, 'terran'), true);
});

test('aire-aire + inmunidad terrestre por diseño', () => {
  assert.equal(C.AIR_VS_AIR_RANGE, 4);
  for (const v of Object.values(C.AIR_UNITS)) assert.ok(v.airDps > 0 && v.bombRadius === 2);
});

test('terreno OpenFront: agua intransitable, montaña más lenta y cara', () => {
  const T = C.TERRAIN;
  assert.ok(T.ticksPerTile[2] > T.ticksPerTile[0], 'montaña más lenta que llanura');
  assert.ok(T.atkLossMult[2] > T.atkLossMult[0]);
  assert.ok(T.ticksPerTile[3] > 50, 'agua intransitable');
});

test('ciudades: dan cap y existen en el mapa', () => {
  assert.ok(C.N_CITIES >= 5 && C.CITY_DEF > C.NEUTRAL_DEF);
  const a = BAL.maxTroops(100, 0, 'terran');
  const b = BAL.maxTroops(100, 1, 'terran');
  assert.equal(b - a, C.TROOPS_PER_CITY);
});

test('crecimiento logístico: frena cerca del cap', () => {
  const mx = BAL.maxTroops(200, 1, 'terran');
  const g1 = BAL.growthPerTick(mx * 0.4, mx, 1);
  const g2 = BAL.growthPerTick(mx * 0.95, mx, 1);
  assert.ok(g1 > g2 * 3, `g40%=${g1} g95%=${g2}`);
  assert.equal(BAL.growthPerTick(mx, mx, 1), 0);
});

test('ataques sostenidos + victoria + inmunidad configurados', () => {
  assert.ok(C.MAX_ATTACKS_PER_PLAYER >= 2 && C.MAX_ATTACKS_PER_PLAYER <= 5);
  assert.ok(C.RETREAT_RETURN_MULT > 0.5 && C.RETREAT_RETURN_MULT < 1);
  assert.equal(C.WIN_PCT, 0.8);
  assert.ok(C.SPAWN_IMMUNITY_TICKS >= 40);
  assert.equal(C.MAP_W * C.CELL_PX, 960);
});
