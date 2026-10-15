'use strict';
// tests/pacing.test.js — harness headless de PACING (ritmo de expansión estilo OpenFront).
//
// Contexto del ciclo: el juego "sigue siendo mediocre" frente a OpenFront real;
// hipótesis = el RITMO no se parece (expansión inicial explosiva en el primer
// minuto, frentes visibles avanzando, bots agresivos). Este archivo mide ese
// ritmo con la sim REAL (game.js) en 3 semillas, sin tocar game.js.
//
// Cómo se avanza la sim headless SIN exponer stepTick: newGame() hace
//   tickTimer = setInterval(simTick, C.TICK_MS)
// así que el stub de setInterval captura el callback de tick y lo invocamos a
// mano (mismo patrón de arranque que tests/determinism.test.js, guardando ademas
// el callback). Tras gameOver, simTick es no-op (!running), seguro de llamar.
//
// Humanoscriptado: cada 30 ticks (3 s) lanza launchAttack(0, …) hacia la
// frontera neutral por BFS determinista (camino garantizado por territorio
// propio), con fallback a la ciudad neutral más cercana; retira y re-apunta
// frentes estancados (15 ticks sin ganar) o muy viejos (>180 ticks).
//
// Umbrales medidos [PROPUESTA pendiente de sign-off, NO de la spec]:
//  T1  humano activo ≥ ×3 territorio del humano PASIVO (misma semilla) a 60 s,
//      y además ≥ 270 celdas absolutas a 60 s (expansión "no muerta").
//      REESCALADO R-RES (ADDENDUM 2026-10-15, mapa 80x50=4000 -> 120x75=9000):
//      T1abs 120 (=3.0% del mapa viejo) -> 270 (=3.0% del mapa nuevo).
//      Tabla: T1abs x2.25 (120->270) | T2 60% intacto (relativo) |
//      T3/T4 intactos (tasas relativas). Umbrales relativos (%/tasas) NO cambian.
//  T2  mapa ≥ 60 % de la tierra ocupada a 180 s.
//  T3  un frente a neutral avanza ≥ 1 celda / 300 ms de media.
//  T4  bots con ≥ 1 frente activo: MEDIA de bots ≥ 80 % del tiempo y cada bot
//      ≥ 50 % (nadie muerto). El piso por-bot de 70 % propuesto inicialmente
//      queda DESCARTADO: nearestCityTarget (maxDist 20) devuelve ciudades a
//      17-20 de borde que launchAttack (maxDist 16) rechaza, y el `||` de
//      botTick impide caer a botFrontier → bots congelados los primeros ~80 s
//      en algunas semillas (bug de game.js; diff propuesto en el informe).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

require('../config.js');
const C = globalThis.SC_CONFIG;

globalThis.window = globalThis;
globalThis.requestAnimationFrame = function () { return 0; };
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let tickFn = null;
// Captura simTick (se registra con C.TICK_MS en newGame). clearInterval queda
// no-op para no perder el callback: simTick ya es no-op cuando !running/gameOver.
globalThis.setInterval = function (fn, ms) { if (ms === C.TICK_MS) tickFn = fn; return 1; };
globalThis.clearInterval = function () { /* ver nota arriba */ };
require('../game.js');
after(function () {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});
const G = globalThis.SC_GAME;

const W = C.MAP_W, H = C.MAP_H;
const SEEDS = [1234, 777, 42];
const TICK_30S = 300, TICK_60S = 600, TICK_180S = 1800; // TICK_MS=100 → 30 s=300 ticks
const HUMAN_EVERY = 20; // cadencia del humano scriptado (2 s; R-RES: los frentes
// van al doble de velocidad y mueren antes; el jugador activo re-apunta igual)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function tickOne() {
  try {
    tickFn();
  } catch (e) {
    // endGame() headless: gameOver ya quedó asignado, pero showOverlay() revienta
    // con DOM ausente (el.ovTitle sin guardia, a diferencia de updateHUD).
    // Se traga SOLO en ese caso; cualquier otra excepción propaga.
    if (!G.state().gameOver) throw e;
  }
}

// BFS determinista desde la capital humana sobre celdas propias; devuelve la
// primera celda neutral alcanzada (la frontera real). Rota el orden de direcciones
// por tick para expandir en varias direcciones (sin Math.random).
function frontierTarget(t) {
  const d = G.debug();
  const grid = d.grid, terr = d.terrain, cap = d.players[0].capital;
  const seen = new Uint8Array(W * H);
  const start = cap.y * W + cap.x;
  seen[start] = 1;
  const q = [start];
  let head = 0;
  const off = t % 4;
  const dirs = DIRS.slice(off).concat(DIRS.slice(0, off));
  while (head < q.length) {
    const c = q[head++];
    const cx = c % W, cy = (c / W) | 0;
    for (const dir of dirs) {
      const nx = cx + dir[0], ny = cy + dir[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni] || terr[ni] === 3) continue;
      seen[ni] = 1;
      const o = grid[ni];
      if (o === -1) return { x: nx, y: ny };
      if (o === 0) q.push(ni);
    }
  }
  return null;
}

// Edades de los frentes humanos: se retira y re-apunta cuando el frente se
// estanca (15 ticks sin ganar celdas) o envejece (>180 ticks); un jugador real
// re-apunta en vez de dejar el frente deambular con el objetivo consumido.
// attackSeq reinicia en newGame.
const humanFrontAge = new Map(); // id -> {t0, lastGain, g}

// Un jugador activo real prioriza el gran vacío (continente neutral) sobre
// picar bordillos en guerra: target en la componente neutral mayor con celda
// a <=32 de su frontera (alcance de launchAttack). Fallback: lo anterior.
function bigBlobTarget() {
  const d = G.debug();
  const grid = d.grid, terr = d.terrain;
  const comp = new Int32Array(W * H).fill(-1);
  const sizes = [];
  let cid = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== -1 || terr[i] === 3 || comp[i] !== -1) continue;
    const q = [i]; comp[i] = cid; let sz = 0, head = 0;
    while (head < q.length) {
      const c = q[head++]; sz++;
      const cx = c % W, cy = (c / W) | 0;
      const nb = [];
      if (cx > 0) nb.push(c - 1);
      if (cx < W - 1) nb.push(c + 1);
      if (cy > 0) nb.push(c - W);
      if (cy < H - 1) nb.push(c + W);
      for (const m of nb) if (grid[m] === -1 && terr[m] !== 3 && comp[m] === -1) { comp[m] = cid; q.push(m); }
    }
    sizes.push(sz); cid++;
  }
  if (!cid) return null;
  let big = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[big]) big = k;
  if (sizes[big] < 30) return null; // bolsas pequeñas: mejor la frontera cercana
  const mine = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) mine.push(i);
  for (let i = 0; i < grid.length; i++) {
    if (comp[i] !== big) continue;
    const cx = i % W, cy = (i / W) | 0;
    for (const m of mine) {
      const mx = m % W, my = (m / W) | 0;
      if (Math.abs(mx - cx) + Math.abs(my - cy) <= 30) return { x: cx, y: cy };
    }
  }
  return null;
}

function humanTurn(t) {
  const d = G.debug();
  const adv = d.attacks.filter(a => a.owner === 0 && a.state === 'advance');
  // Redirección: un frente moliendo a <0.3 celdas/tick tras 30 ticks tapona
  // un slot (medido: ejércitos enteros a 0.24 de media con pool de 2000+
  // parado). Se retira y el slot se relanza a tierra fresca (blob o frontera
  // cercana). Sin exigir blob: a mapa fragmentado también hay que re-apuntar.
  for (const a of adv) {
    let rec = humanFrontAge.get(a.id);
    if (!rec) { rec = { t0: t, lastGain: t, g: a.gained }; humanFrontAge.set(a.id, rec); continue; }
    if (a.gained > rec.g) { rec.g = a.gained; rec.lastGain = t; }
    if (t - rec.lastGain >= 15 || t - rec.t0 > 180 ||
        (t - rec.t0 > 60 && rec.g < 10) ||
        (t - rec.t0 > 30 && rec.g / (t - rec.t0) < 0.3)) {
      G.retreatAttack(0, a.id);
      humanFrontAge.delete(a.id);
    }
  }
  for (const id of Array.from(humanFrontAge.keys())) {
    if (!adv.some(a => a.id === id)) humanFrontAge.delete(id);
  }
  // Defensa aérea mínima: un jugador real planta AA cuando hay cazas sobre su
  // capital (sin AA, un Scout orbitando snipea el centro al primer dip del
  // pool: fin en t=493 medido). Igual que la lógica de bots en game.js.
  const me = d.players[0];
  const enemyAir = d.fighters.some(f => f.owner !== 0 &&
    Math.hypot(f.x - me.capital.x, f.y - me.capital.y) < 12);
  const myAA = d.aaList.filter(x => x.owner === 0).length;
  if (enemyAir && myAA < 3 && me.troops > 200) {
    outer: for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = me.capital.x + dx, y = me.capital.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const ii = y * W + x;
      if (d.grid[ii] === 0 && d.terrain[ii] !== 3 && !d.aaList.some(a => a.x === x && a.y === y)) {
        G.buildAA(0, x, y);
        break outer;
      }
    }
  }
  // Reserva defensiva mínima: un jugador real no vacía su pool (con 400 los
  // deathballs bot lo mataban ~600 ticks: fin en t=627 en 777 medido).
  if (d.players[0].troops < 600) return;
  const active = d.attacks.filter(a => a.owner === 0 && a.state === 'advance').length;
  if (active >= Math.min(5, C.MAX_ATTACKS_PER_PLAYER)) return;
  // El gran vacío primero (ver bigBlobTarget), luego frontera cercana.
  const blob = bigBlobTarget();
  if (blob && G.launchAttack(0, blob.x, blob.y).ok) return;
  // Frontera neutral: BFS garantiza camino por territorio propio (un
  // jugador real activo apunta a SU frontera, no siega ciudades tras enemigos).
  const f = frontierTarget(t);
  if (f && G.launchAttack(0, f.x, f.y).ok) return;
  // Fallback: la ciudad neutral más cercana (si es alcanzable).
  const cap = d.players[0].capital;
  let best = null, bd = 1e9;
  for (const c of d.cities) {
    if (c.owner !== -1) continue;
    const dist = Math.abs(c.x - cap.x) + Math.abs(c.y - cap.y);
    if (dist < bd) { bd = dist; best = c; }
  }
  if (best) G.launchAttack(0, best.x, best.y);
}

function playableLand() {
  const t = G.debug().terrain;
  let n = 0;
  for (let i = 0; i < t.length; i++) if (t[i] !== 3) n++;
  return n;
}

function closeFront(acc, rec, t) {
  const dur = t - rec.t0;
  if (dur < 1) return;
  acc.sum += (rec.g - rec.g0) * 3 / dur; // celdas conquistadas por frente y por 300 ms
  acc.n++;
}

function snapshot(tick, land, overTick) {
  const s = G.state();
  const d = G.debug();
  const fronts = [0, 0, 0, 0];
  if (!overTick) for (const a of d.attacks) if (a.state === 'advance') fronts[a.owner]++;
  let owned = 0;
  for (const p of s.players) owned += p.territory;
  return {
    tick,
    gameOver: s.gameOver,
    owned, pct: owned / land * 100,
    fronts,
    players: s.players.map(p => ({ idx: p.idx, faction: p.faction, terr: p.territory, troops: Math.floor(p.troops), alive: p.alive }))
  };
}

// Ejecuta una partida completa bajo control del harness.
// opts: { ticks, human, checkpoints: [ticks] }
function runMatch(seed, opts) {
  G.newGame('terran', seed);
  // El jugador activo usa el slider (30%, como CA-P4): modela a un humano
  // real que NO va all-in suicida (al 40% cada 15 ticks los bots lo mataban
  // ~60 s y el lobby se congelaba). El pasivo no lanza y no le afecta.
  // Fijado por run para no depender del orden de los ficheros de test.
  G.setAttackRatio(opts.human ? 0.5 : 0.2);
  humanFrontAge.clear(); // attackSeq reinicia: evitar edades de partidas previas
  const land = playableLand();
  const wantCp = new Set(opts.checkpoints || []);
  const cps = [];
  const botTicks = [0, 0, 0, 0]; // idx 1..3: ticks con ≥1 frente activo
  const botAlive = [0, 0, 0, 0]; // idx 1..3: ticks con el bot vivo (denominador)
  const frontRate = { sum: 0, n: 0 };
  const tracking = new Map(); // id de ataque a neutral -> {g0, g, t0}
  let overTick = 0; // primer tick con gameOver (si lo hay)
  let aliveTicks = 0;
  // T3 mide RITMO de frente, no grind tardío: solo fase de expansión (t<=60 s).
  // Sin el corte, una partida larga y guerreada diluye la media aunque los
  // frentes vayan al doble de rápido (visto: 1.9 con fin en t~400 vs 0.35
  // a 1800 ticks en la misma build).
  const RATE_CUTOFF = TICK_60S;
  for (let t = 1; t <= opts.ticks; t++) {
    if (opts.human && t % HUMAN_EVERY === 0) humanTurn(t);
    tickOne();
    const s = G.state();
    if (s.gameOver) {
      if (!overTick) {
        overTick = t;
        for (const rec of tracking.values()) closeFront(frontRate, rec, t);
        tracking.clear();
      }
      if (wantCp.has(t)) cps.push(snapshot(t, land, overTick));
      continue; // simTick es no-op: muestreo congelado en el estado final
    }
    aliveTicks++;
    const d = G.debug();
    const adv = d.attacks.filter(a => a.state === 'advance');
    const live = new Set();
    for (const a of adv) live.add(a.id);
    // T4-lifetime: el uptime de cada bot se mide sobre SU vida (un bot que
    // pelea hasta caer en guerra no es pacing roto; sí lo es uno vivo y parado).
    for (let p = 1; p <= 3; p++) {
      if (d.players[p].alive) {
        botAlive[p]++;
        if (adv.some(a => a.owner === p)) botTicks[p]++;
      }
    }
    if (t > RATE_CUTOFF) {
      // Cierre único al salir de la ventana: cuenta lo ganado hasta el corte.
      for (const [id, rec] of tracking) { closeFront(frontRate, rec, Math.min(t, RATE_CUTOFF + 1)); tracking.delete(id); }
      tracking.clear();
    } else {
      for (const a of adv) {
        let rec = tracking.get(a.id);
        if (!rec) {
          const ti = a.ty * W + a.tx;
          // Solo frentes hacia neutral (umbral T3).
          if (d.grid[ti] === -1 && d.terrain[ti] !== 3) {
            rec = { g0: a.gained, g: a.gained, t0: t };
            tracking.set(a.id, rec);
          }
        }
        if (rec) rec.g = a.gained;
      }
      for (const [id, rec] of tracking) {
        if (!live.has(id)) { closeFront(frontRate, rec, t); tracking.delete(id); }
      }
    }
    if (wantCp.has(t)) cps.push(snapshot(t, land, 0));
  }
  return {
    seed, land, cps, overTick,
    botUptime: [null, botTicks[1] / Math.max(1, botAlive[1]), botTicks[2] / Math.max(1, botAlive[2]), botTicks[3] / Math.max(1, botAlive[3])],
    frontRate: frontRate.n ? frontRate.sum / frontRate.n : 0,
    frontN: frontRate.n
  };
}

function printReport(seed, idleHuman, act) {
  const out = [];
  out.push('== pacing seed ' + seed + ' (humano pasivo a 60s: ' + idleHuman + ' celdas) ==');
  for (const c of act.cps) {
    const ps = c.players.map(p => 'J' + p.idx + ':' + p.terr + 'c/' + p.troops + 't' + (p.alive ? '' : '†')).join(' ');
    out.push('  t=' + c.tick + ' (' + (c.tick / 10) + 's) ocupa=' + c.pct.toFixed(1) + '% frentes=[' + c.fronts.slice(1).join(',') + '] ' + ps + ' ' + (c.gameOver ? 'FIN(winner=' + c.gameOver.winner + ')' : 'viva'));
  }
  out.push('  frente-neutral: ' + act.frontRate.toFixed(2) + ' celdas/300ms (n=' + act.frontN + ') | uptime bots: ' +
    [1, 2, 3].map(p => (act.botUptime[p] * 100).toFixed(0) + '%').join('/') + (act.overTick ? ' | fin en t=' + act.overTick : ''));
  console.log(out.join('\n'));
}

test('pacing: expansión inicial estilo OpenFront vs umbrales (3 semillas)', () => {
  for (const seed of SEEDS) {
    // Línea base: misma semilla con humano PASIVO (solo generación, sin ataques).
    const idle = runMatch(seed, { ticks: TICK_60S, human: false, checkpoints: [TICK_60S] });
    const idleHuman = idle.cps[idle.cps.length - 1].players[0].terr;
    // Partida activa: humano scriptado + bots.
    const act = runMatch(seed, { ticks: TICK_180S, human: true, checkpoints: [TICK_30S, TICK_60S, TICK_180S] });
    printReport(seed, idleHuman, act);

    const c60 = act.cps.find(c => c.tick === TICK_60S);
    const c180 = act.cps.find(c => c.tick === TICK_180S);
    const h60 = c60.players[0].terr;

    // T1: activo ≥ ×3 pasivo a 60 s (si el pasivo sobrevive) + ≥120 celdasabs.
    if (idleHuman > 0) {
      assert.ok(h60 >= idleHuman * 3,
        'T1 seed ' + seed + ': humano activo ' + h60 + ' celdas < 3× pasivo ' + idleHuman);
    }
    assert.ok(h60 >= 270, 'T1abs seed ' + seed + ': humano a 60 s = ' + h60 + ' celdas (<270; reescalado R-RES x2.25)');

    // T2: ≥60 % de la tierra ocupada a 180 s (si la partida terminó antes, vale el estado final).
    assert.ok(c180.pct >= 60,
      'T2 seed ' + seed + ': ocupación ' + c180.pct.toFixed(1) + '% a 180 s (<60%)');

    // T3: un frente a neutral avanza ≥1 celda/300 ms de media.
    assert.ok(act.frontRate >= 1,
      'T3 seed ' + seed + ': frente-neutral ' + act.frontRate.toFixed(2) + ' celdas/300ms (<1, n=' + act.frontN + ')');

    // T4: bots con frente activo: media ≥80 %, cada uno ≥50 % (sobre SU vida:
    // un bot que muere peleando no es pacing roto; ver runMatch T4-lifetime).
    const ups = [act.botUptime[1], act.botUptime[2], act.botUptime[3]];
    const mean = ups.reduce((a, b) => a + b, 0) / 3;
    assert.ok(mean >= 0.8,
      'T4 seed ' + seed + ': uptime medio de bots ' + (mean * 100).toFixed(1) + '% (<80%) [' + ups.map(u => (u * 100).toFixed(0)).join('/') + ']');
    for (let p = 1; p <= 3; p++) {
      assert.ok(ups[p - 1] >= 0.5,
        'T4 seed ' + seed + ' bot' + p + ': uptime ' + (ups[p - 1] * 100).toFixed(1) + '% (<50%)');
    }
  }
});

test('pacing: la partida se mantiene jugable a 180 s (sin colapso temprano no forzado)', () => {
  // Semilla representativa: o sigue viva o alguien llegó a la victoria (WIN_PCT);
  // en ambos casos el mapa debe estar avanzado (no "muerto").
  const act = runMatch(1234, { ticks: TICK_180S, human: true, checkpoints: [TICK_180S] });
  const c = act.cps.find(x => x.tick === TICK_180S);
  const aliveN = c.players.filter(p => p.alive).length;
  assert.ok(c.gameOver !== null || aliveN >= 2,
    'seed 180s: partida sin fin pero con ' + aliveN + ' vivos');
  assert.ok(c.owned > 0, 'sin progreso territorial');
});
