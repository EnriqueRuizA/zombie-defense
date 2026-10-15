/* SC_CONFIG v2: balance + terreno + ciudades + crecimiento logístico estilo OpenFront. */
(function (global) {
  'use strict';

  var FACTIONS = {
    terran: {
      id: 'terran', name: 'Terran', color: '#3b82f6', dark: '#1e3a8a',
      border: '#93c5fd', atkMult: 1.0, defMult: 1.15, genMult: 1.0,
      costMult: 1.0, capMult: 1.0, airCostMult: 1.1, aaCostMult: 1.0,
      aaDmgMult: 1.2, shieldFirstHit: 0, cityName: 'Command Center',
      desc: 'Turtle: +15% defensa, AA +20% daño.'
    },
    zerg: {
      id: 'zerg', name: 'Zerg', color: '#a855f7', dark: '#581c87',
      border: '#d8b4fe', atkMult: 0.85, defMult: 0.85, genMult: 1.25,
      costMult: 0.8, capMult: 0.9, airCostMult: 0.75, aaCostMult: 0.7,
      aaDmgMult: 0.9, shieldFirstHit: 0, cityName: 'Hatchery',
      desc: 'Enjambre: +25% gen, expansión barata, frágil.'
    },
    protoss: {
      id: 'protoss', name: 'Protoss', color: '#eab308', dark: '#713f12',
      border: '#fde68a', atkMult: 1.3, defMult: 1.0, genMult: 0.78,
      costMult: 1.15, capMult: 1.1, airCostMult: 1.4, aaCostMult: 1.1,
      aaDmgMult: 1.1, shieldFirstHit: 0.25, cityName: 'Nexus',
      desc: 'Élite: +30% ataque, escudo 25%, -22% gen.'
    }
  };

  var AIR_UNITS = {
    terran: { id: 'wraith', name: 'Wraith', cost: 150, hp: 100, shield: 0, speed: 9, bombDamage: 40, bombRadius: 2, airDps: 15 },
    zerg: { id: 'mutalisk', name: 'Mutalisco', cost: 110, hp: 70, shield: 0, speed: 12, bombDamage: 28, bombRadius: 2, airDps: 12 },
    protoss: { id: 'scout', name: 'Scout', cost: 210, hp: 160, shield: 40, speed: 7, bombDamage: 60, bombRadius: 2, airDps: 20 }
  };

  var AA_BUILDINGS = {
    terran: { id: 'turret', name: 'Missile Turret', cost: 60, hp: 50, range: 5, dps: 25 },
    zerg: { id: 'spore', name: 'Spore Colony', cost: 40, hp: 40, range: 5, dps: 20 },
    protoss: { id: 'cannon', name: 'Photon Cannon [AA]', cost: 55, hp: 55, range: 5, dps: 27 }
  };

  // Terreno: 0 llanura, 1 tierras altas, 2 montaña, 3 agua.
  // R-RES (ADDENDUM 2026-10-15): ticksPerTile [1,2,3]->[0,1,2]; la llanura
  // avanza 1 celda/tick (era cada 2) para el mapa 2.25x mayor. Orden intacto.
  var TERRAIN = {
    costMult: [1.0, 1.1, 1.3, 99],
    ticksPerTile: [0, 1, 2, 99],
    atkLossMult: [0.4, 0.6, 0.8, 1],
    colors: ['#0f1b2d', '#14273d', '#1b2f4a', '#020617'],
    waterColor: '#0369a1'
  };

  // R-RES (ADDENDUM 2026-10-15): mapa 120x75 celda 8px, mismo canvas 960x600.
  // R-EXP: potencia superlineal (POWER=1.15: 2x tropas => ~2.2x potencia) +
  // economia de escala en perdidas (LOSS_EXP) + techo de frentes por territorio.
  // R-BUNKER: edificio anti-tierra por faccion, 3 niveles, coste en TROPAS.
  // Dificultades (spec tabla): F x0.5 / M x0.75 / D x1.0 / I x1.25 + Bot cap/3.
  var DIFFICULTY = {
    options: { facil: 0.5, media: 0.75, dificil: 1.0, imposible: 1.25 },
    def: 'media', BOT_CAP_DIV: 3
  };

  // Calibracion 2026-10-15 (scratch exp-cal.js): con LOSS_EXP=0.12 el techo
  // geografico tapaba el efecto (seed 1234: 31 vs 31). LOSS_EXP=0.25 da
  // celdas(2T)/celdas(T) = 2*2^0.25 ~= 2.38 en pasillo controlado (medido).
  // Techo 2->4 (cada 400 celdas): pocos frentes = pool acumulado = frentes
  // GRANDES, que rinden superlineal (muchos frentes pequeños se atascan).
  var EXP = {
    POWER: 1.15, K: 0.04,
    LOSS_REF: 100, LOSS_EXP: 0.25,
    EMPIRE_DIV: 1500,
    FRONT_BASE: 2, FRONT_PER_TILE: 400
  };

  var BUNKERS = {
    terran: {
      id: 'bunker', name: 'Bunker', cost: 80, upgrades: [60, 90],
      hp: [120, 200, 300], range: [4, 5, 6], dps: [6, 12, 20],
      slow: [0.25, 0.5, 0.75], defBonus: [12, 24, 40]
    },
    zerg: {
      id: 'sunken', name: 'Sunken Colony', cost: 60, upgrades: [45, 70],
      hp: [90, 150, 240], range: [4, 5, 6], dps: [5, 10, 17],
      slow: [0.25, 0.5, 0.75], defBonus: [10, 20, 34]
    },
    protoss: {
      id: 'battery', name: 'Shield Battery [cañon]', cost: 75, upgrades: [55, 85],
      hp: [100, 170, 260], range: [4, 5, 6], dps: [7, 13, 22],
      slow: [0.25, 0.5, 0.75], defBonus: [11, 22, 38]
    }
  };

  var CONFIG = {
    MAP_W: 120, MAP_H: 75, CELL_PX: 8, TICK_MS: 100,
    SPAWN_PHASE_TICKS: 100,
    // Pacing OpenFront (PROPUESTA ciclo ritmo): economía más rápida y frentes
    // baratos para la expansión explosiva del primer minuto.
    START_TROOPS: 900, MAX_TROOPS_BASE: 1000,
    TROOPS_PER_TILE: 12, TROOPS_PER_CITY: 350,
    // GEN_K 26 (era 8): el mapa es 2.25x mayor (9000/4000) y el mismo %/tiempo
    // exige ~2.25x ingresos: 8x2.25=18 -> 26 tras medir quemas de guerra
    // (38.5% K=8, 50.6% K=16, 53.6% K=20 en 1234). K solo escala: intactos
    // ratios CA-P18 y forma logística CA-P3.
    GEN_K: 26, GEN_POW: 0.73, GEN_DIV: 40,
    NEUTRAL_DEF: 4, CITY_DEF: 12, CITY_GEN: 3,
    // CAPITAL_DEF_MULT 4->7: los deathballs (1200+ comprometidas, poder ~116)
    // one-shoteaban capitales con escudo medio (def ~72) y el humano caía en
    // ~600 ticks en 777. Con x7 (~126) solo pasan 1500+ (poder ~135).
    CAPITAL_SIZE: 3, CAPITAL_DEF_MULT: 7,
    // MAX_ATTACKS 4->5 (el test de balance admite <=5): con pools de miles de
    // tropas el techo 4 dejaba ingresos sin desplegar (J0 2519 en 1234). El
    // gating inteligente sigue en frontCap (2->5 por territorio).
    MAX_FIGHTERS: 5, MAX_AA: 30, MAX_BUNKERS: 30, MAX_ATTACKS_PER_PLAYER: 5,
    WIN_PCT: 0.80, SPAWN_IMMUNITY_TICKS: 50,
    FIGHTER_LIFETIME_S: 22, BOMB_TICK_S: 1.0, AIR_VS_AIR_RANGE: 4,
    RETREAT_RETURN_MULT: 0.75, RETREAT_DELAY_TICKS: 20,
    // N_CITIES 16->20: la densidad de ciudades cayó a menos de la mitad con
    // el mapa 2.25x (eran 16/4000 celdas). 20 es conservador (proporcional=36).
    N_CITIES: 20,
    FACTIONS: FACTIONS, AIR_UNITS: AIR_UNITS, AA_BUILDINGS: AA_BUILDINGS,
    BUNKERS: BUNKERS, DIFFICULTY: DIFFICULTY, EXP: EXP,
    TERRAIN: TERRAIN,
    VISUAL: {
      landBase: [104, 102, 58],
      landVar: 22,
      waterShallow: [20, 64, 102],
      waterDeep: [4, 20, 38],
      waterDepthSteps: 6,
      territoryAlpha: 0.55,
      borderColor: 'rgba(255,255,255,0.92)',
      borderWidth: 1.5
    }
  };

  function factionOf(id) { return FACTIONS[id]; }
  function airOf(factionId, factionMods) {
    var base = AIR_UNITS[factionId], out = {};
    for (var k in base) out[k] = base[k];
    if (factionMods && factionMods.airCostMult) out.cost = Math.round(base.cost * factionMods.airCostMult / 5) * 5;
    return out;
  }
  function aaOf(factionId, factionMods) {
    var base = AA_BUILDINGS[factionId], out = {};
    for (var k in base) out[k] = base[k];
    if (factionMods) {
      if (factionMods.aaCostMult) out.cost = Math.round(base.cost * factionMods.aaCostMult);
      if (factionMods.aaDmgMult) out.dps = Math.round(base.dps * factionMods.aaDmgMult);
    }
    return out;
  }
  function maxTroops(territory, cities, factionId) {
    var m = (FACTIONS[factionId] && FACTIONS[factionId].capMult) || 1;
    return Math.round((CONFIG.MAX_TROOPS_BASE + territory * CONFIG.TROOPS_PER_TILE + cities * CONFIG.TROOPS_PER_CITY) * m);
  }
  function growthPerTick(troops, max, genMult) {
    if (troops >= max) return 0;
    return (CONFIG.GEN_K + Math.pow(Math.max(troops, 1), CONFIG.GEN_POW) / CONFIG.GEN_DIV) * (1 - troops / max) * genMult;
  }
  function resolveGroundAssault(attackPower, defensePower, defenderFactionId) {
    var def = defensePower;
    var mods = FACTIONS[defenderFactionId];
    if (mods && mods.shieldFirstHit > 0) def = def * (1 + mods.shieldFirstHit);
    return attackPower > def;
  }
  // R-EXP: potencia superlineal con las tropas comprometidas (POWER=1.15:
  // 2x tropas => 2^1.15 ~= 2.22x potencia) y economia de escala con el
  // imperio (EMPIRE_DIV). Las perdidas por celda decrecen con el tamano
  // del frente (LOSS_EXP): a mas tropas, mas celdas por tropa.
  function expPower(troops, territory, atkMult) {
    var t = Math.max(troops, 1), terr = Math.max(territory || 0, 0);
    return 10 + CONFIG.EXP.K * Math.pow(t, CONFIG.EXP.POWER) *
      (atkMult || 1) * (1 + terr / CONFIG.EXP.EMPIRE_DIV);
  }
  function expLossMult(troops) {
    return Math.pow(CONFIG.EXP.LOSS_REF / Math.max(troops, 1), CONFIG.EXP.LOSS_EXP);
  }
  // Techo de frentes simultaneos que crece con el territorio (cap duro intacto).
  function frontCap(territory) {
    return Math.min(CONFIG.MAX_ATTACKS_PER_PLAYER,
      CONFIG.EXP.FRONT_BASE + Math.floor((territory || 0) / CONFIG.EXP.FRONT_PER_TILE));
  }

  global.SC_CONFIG = CONFIG;
  global.SC_BALANCE = {
    factionOf: factionOf, airOf: airOf, aaOf: aaOf,
    maxTroops: maxTroops, growthPerTick: growthPerTick,
    resolveGroundAssault: resolveGroundAssault,
    expPower: expPower, expLossMult: expLossMult, frontCap: frontCap
  };
})(typeof window !== 'undefined' ? window : globalThis);
