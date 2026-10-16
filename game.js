/* game.js v2 — clon Zombie Defense: terreno+agua, ciudades, ataques sostenidos, leaderboard, SC + aire + AA. Sin dependencias, file:// OK. */
(function () {
  'use strict';

  var C = window.SC_CONFIG;
  var BAL = window.SC_BALANCE;
  var W = C.MAP_W, H = C.MAP_H, CELL = C.CELL_PX;

  var grid, terrain, players = [], fighters = [], aaList = [], bunkers = [], cities = [], attacks = [];
  var running = false, tickTimer = null, lastTime = 0, runId = 0;
  // Oleada 1a: fase spawn elegible + dificultad de lobby + celda seleccionada.
  var phase = 'play', spawnCloseTick = 0, difficulty = (C.DIFFICULTY && C.DIFFICULTY.def) || 'media';
  var selected = { x: -1, y: -1 };
  // QD-001: estado de pausa a nivel de módulo (antes local de boot) para que
  // newGame() pueda resetearlo y los tests headless puedan verificarlo.
  var pausedFlag = false, btnPauseEl = null;
  var attackRatio = 0.2, mode = 'attack';
  var hover = { x: -1, y: -1 };
  var message = '', messageUntil = 0, gameOver = null, tickCount = 0, attackSeq = 1;

  // ---------- RNG determinista (oleada 0: cero aleatoriedad no sembrada en sim) ----------
  var rngS = 1, simSeed = 0;
  function srand(s) { rngS = (s | 0) || 1; }
  function rnd() {
    rngS |= 0; rngS = (rngS + 0x6D2B79F5) | 0;
    var t = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function mapHash() {
    var h = 2166136261 >>> 0, i;
    function mix(n) { h ^= (n & 0xffff); h = (h * 16777619) >>> 0; h ^= ((n >>> 16) & 0xffff); h = (h * 16777619) >>> 0; }
    for (i = 0; i < terrain.length; i++) mix(terrain[i] + 1);
    for (i = 0; i < grid.length; i++) mix(grid[i] + 4);
    for (i = 0; i < cities.length; i++) { mix(cities[i].x); mix(cities[i].y); mix(cities[i].owner + 2); }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  var canvas, ctx, el = {};

  function idx(x, y) { return y * W + x; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function isWater(x, y) { return inBounds(x, y) && terrain[idx(x, y)] === 3; }
  function ownerAt(x, y) { return inBounds(x, y) ? grid[idx(x, y)] : -9; }
  function $(id) { return document.getElementById(id); }

  // ---------- Generación de mapa continental (solo rnd/srand: determinista) ----------
  // Blobs radiales + ruido de valores suavizado + umbral adaptativo 15-40% agua.
  function genTerrain(seed) {
    void seed;
    terrain = new Uint8Array(W * H);
    // 1) Rejilla gruesa de ruido via rnd().
    var GW = 10, GH = 7, gx, gy;
    var coarse = new Float32Array((GW + 1) * (GH + 1));
    for (gy = 0; gy <= GH; gy++) for (gx = 0; gx <= GW; gx++) coarse[gy * (GW + 1) + gx] = rnd();
    function vnoise(x, y) {
      var fx = x / W * GW, fy = y / H * GH;
      var x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 >= GW) x0 = GW - 1;
      if (y0 >= GH) y0 = GH - 1;
      var tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = coarse[y0 * (GW + 1) + x0], b = coarse[y0 * (GW + 1) + x0 + 1];
      var c = coarse[(y0 + 1) * (GW + 1) + x0], d = coarse[(y0 + 1) * (GW + 1) + x0 + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
    // 2) Blobs radiales via rnd(): 5-7 manchas orgánicas.
    var nBlobs = 5 + Math.floor(rnd() * 3);
    var blobs = [];
    for (var b = 0; b < nBlobs; b++) {
      blobs.push({
        cx: W * (0.15 + rnd() * 0.7), cy: H * (0.15 + rnd() * 0.7),
        r: Math.min(W, H) * (0.28 + rnd() * 0.30), w: 0.5 + rnd() * 0.7
      });
    }
    var hgt = new Float32Array(W * H);
    var bi, x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var n = vnoise(x, y);
      var f = 0, tot = 0;
      for (bi = 0; bi < blobs.length; bi++) {
        var dx = x - blobs[bi].cx, dy = (y - blobs[bi].cy) * 1.25;
        var dist = Math.sqrt(dx * dx + dy * dy) / blobs[bi].r;
        if (dist < 1) { var fall = (1 - dist); fall *= fall; f += fall * blobs[bi].w; tot += blobs[bi].w; }
      }
      var blobN = tot > 0 ? f / blobs.length : 0;
      hgt[idx(x, y)] = n * 0.55 + blobN * 0.45 + n * blobN * 0.25;
    }
    // 3) Umbral adaptativo: agua objetivo 15-40% (22-32% según rnd).
    var target = 0.22 + rnd() * 0.10;
    var sorted = Array.prototype.slice.call(hgt).sort(function (a, b2) { return a - b2; });
    var thresh = sorted[Math.floor(sorted.length * target)];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      terrain[idx(x, y)] = hgt[idx(x, y)] < thresh ? 3 : 0;
    }
    // 4) Suavizado de costas: 2 pasadas quitan cuadrados aislados.
    for (var pass = 0; pass < 2; pass++) {
      var copy = new Uint8Array(terrain);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var water = 0, land = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx2 = -1; dx2 <= 1; dx2++) {
          if (!dx2 && !dy) continue;
          var nx = x + dx2, ny = y + dy;
          if (!inBounds(nx, ny)) { water++; continue; }
          if (copy[idx(nx, ny)] === 3) water++; else land++;
        }
        var cur = copy[idx(x, y)];
        if (cur === 3 && land >= 6) terrain[idx(x, y)] = 0;
        else if (cur !== 3 && water >= 6) terrain[idx(x, y)] = 3;
      }
    }
    // Limpieza: cero celdas de agua 100% rodeadas de tierra.
    cleanIsolatedWater();
    // 5) Subtipos de tierra por altura relativa (llanura/altas/montaña).
    var maxH = 0.0001;
    for (var i = 0; i < hgt.length; i++) if (terrain[i] !== 3 && hgt[i] > maxH) maxH = hgt[i];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var ii = idx(x, y);
      if (terrain[ii] === 3) continue;
      var rel = (hgt[ii] - thresh) / (maxH - thresh + 1e-6);
      terrain[ii] = rel > 0.55 ? 2 : rel > 0.28 ? 1 : 0;
    }
  }
  // QD-003: conecta el agua fragmentada hasta que el componente mayor cubra
  // >=60% del agua (PROPUESTA pendiente de sign-off; ver informe). Solo lógica
  // determinista sembrada: BFS multicamino desde el componente mayor
  // hasta el lago próximo, esquivando zonas protegidas (capitales 5x5,
  // ciudades 3x3). Las celdas abiertas se sincronizan en grid (-3 = agua).
  var WATER_MAJOR_MIN = 0.60, WATER_MAX_PCT = 0.40;
  function waterStats() {
    var total = 0, i;
    for (i = 0; i < terrain.length; i++) if (terrain[i] === 3) total++;
    var comp = new Int32Array(terrain.length).fill(-1);
    var sizes = [], cid = 0;
    for (i = 0; i < terrain.length; i++) {
      if (terrain[i] !== 3 || comp[i] !== -1) continue;
      var q = [i]; comp[i] = cid; var sz = 0, head = 0;
      while (head < q.length) {
        var c = q[head++]; sz++;
        var cx = c % W, cy = (c / W) | 0;
        if (cx > 0 && terrain[c - 1] === 3 && comp[c - 1] === -1) { comp[c - 1] = cid; q.push(c - 1); }
        if (cx < W - 1 && terrain[c + 1] === 3 && comp[c + 1] === -1) { comp[c + 1] = cid; q.push(c + 1); }
        if (cy > 0 && terrain[c - W] === 3 && comp[c - W] === -1) { comp[c - W] = cid; q.push(c - W); }
        if (cy < H - 1 && terrain[c + W] === 3 && comp[c + W] === -1) { comp[c + W] = cid; q.push(c + W); }
      }
      sizes.push(sz); cid++;
    }
    var mayor = 0, mayorId = -1, k;
    for (k = 0; k < sizes.length; k++) if (sizes[k] > mayor) { mayor = sizes[k]; mayorId = k; }
    return { total: total, lakes: sizes.length, mayor: mayor, mayorId: mayorId, comp: comp };
  }
  function buildProtected() {
    var p = new Uint8Array(W * H), x, y, dx, dy;
    players.forEach(function (pl) {
      for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
        x = pl.capital.x + dx; y = pl.capital.y + dy;
        if (inBounds(x, y)) p[idx(x, y)] = 1;
      }
    });
    cities.forEach(function (c) {
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        x = c.x + dx; y = c.y + dy;
        if (inBounds(x, y)) p[idx(x, y)] = 1;
      }
    });
    return p;
  }
  function connectWaterMajor() {
    var guarded = buildProtected();
    for (var iter = 0; iter < 40; iter++) {
      var st = waterStats();
      if (st.total === 0 || st.mayor / st.total >= WATER_MAJOR_MIN) return;
      // BFS multicamino desde el componente mayor; bloquea celdas protegidas.
      var prev = new Int32Array(terrain.length).fill(-1);
      var q = [], head = 0, i;
      for (i = 0; i < terrain.length; i++) {
        if (terrain[i] === 3 && st.comp[i] === st.mayorId) { prev[i] = i; q.push(i); }
      }
      var target = -1;
      while (head < q.length && target === -1) {
        var c = q[head++];
        var cx = c % W, cy = (c / W) | 0;
        var nb = [];
        if (cx > 0) nb.push(c - 1);
        if (cx < W - 1) nb.push(c + 1);
        if (cy > 0) nb.push(c - W);
        if (cy < H - 1) nb.push(c + W);
        for (var n = 0; n < nb.length; n++) {
          var m = nb[n];
          if (prev[m] !== -1 || guarded[m]) continue;
          prev[m] = c;
          if (terrain[m] === 3 && st.comp[m] !== st.mayorId) { target = m; break; }
          q.push(m);
        }
      }
      if (target === -1) return; // sin ruta: lagos cercados por protegidas.
      // Reconstruye y abre el canal (tierra->agua + grid -3).
      var path = [], cc = target;
      while (prev[cc] !== cc) { path.push(cc); cc = prev[cc]; }
      var add = 0, k;
      for (k = 0; k < path.length; k++) if (terrain[path[k]] !== 3) add++;
      if ((st.total + add) / terrain.length > WATER_MAX_PCT) return; // techo water%.
      for (k = 0; k < path.length; k++) {
        if (terrain[path[k]] !== 3) { terrain[path[k]] = 3; if (grid) grid[path[k]] = -3; }
      }
    }
  }
  // FIX5(a), v4: teatro único por muestreo determinista con reintento.
  // La componente mayor de tierra debe cubrir >=80% para que la victoria por
  // % de tierra sea alcanzable (estilo Zombie Defense). Se descarta la opción (b)
  // —victoria sobre la componente mayor— porque permitiría "ganar" con el
  // enemigo dueño de casi todo el continente principal y mostraría victoria
  // con ~53% en el HUD, rompiendo la semántica "% de tierra" de la spec.
  // También se descartan los puentes tallados (v1-v3, eliminados): los canales
  // QD-003 cercaban los puentes cortando sus extremos (sonda: puentes intactos
  // pero tierra 36.5%) y los puentes partían el mar mayor (1234: 36.8%).
  // En su lugar: genera candidatos con el pipeline existente (sin tallar nada)
  // avanzando el stream determinista de rnd() hasta que tierra mayor >=80% Y
  // agua mayor >=60% Y agua 15-40% (<=40 intentos; p(fallo/intento)≈0.275
  // medida en 40 semillas ⇒ P(40 fallos)≈1e-22; si ocurre, se acepta el último
  // candidato y queda documentado). Sin aleatoriedad nueva fuera del fallback
  // de semilla: solo rnd().
  var LAND_MAJOR_MIN = 0.80, WATER_MIN_PCT = 0.15;
  var WORLD_ATTEMPTS = 40;
  function landStats() {
    var total = 0, i;
    for (i = 0; i < terrain.length; i++) if (terrain[i] !== 3) total++;
    var comp = new Int32Array(terrain.length).fill(-1);
    var sizes = [], cid = 0;
    for (i = 0; i < terrain.length; i++) {
      if (terrain[i] === 3 || comp[i] !== -1) continue;
      var q = [i]; comp[i] = cid; var sz = 0, head = 0;
      while (head < q.length) {
        var c = q[head++]; sz++;
        var cx = c % W, cy = (c / W) | 0;
        if (cx > 0 && terrain[c - 1] !== 3 && comp[c - 1] === -1) { comp[c - 1] = cid; q.push(c - 1); }
        if (cx < W - 1 && terrain[c + 1] !== 3 && comp[c + 1] === -1) { comp[c + 1] = cid; q.push(c + 1); }
        if (cy > 0 && terrain[c - W] !== 3 && comp[c - W] === -1) { comp[c - W] = cid; q.push(c - W); }
        if (cy < H - 1 && terrain[c + W] !== 3 && comp[c + W] === -1) { comp[c + W] = cid; q.push(c + W); }
      }
      sizes.push(sz); cid++;
    }
    var mayor = 0, mayorId = -1, k;
    for (k = 0; k < sizes.length; k++) if (sizes[k] > mayor) { mayor = sizes[k]; mayorId = k; }
    return { total: total, mayor: mayor, mayorId: mayorId, comp: comp };
  }
  function worldOk() {
    var ls = landStats(), ws = waterStats(), i, water = 0;
    for (i = 0; i < terrain.length; i++) if (terrain[i] === 3) water++;
    var wpct = water / terrain.length;
    return ls.mayor / ls.total >= LAND_MAJOR_MIN &&
      (ws.total === 0 || ws.mayor / ws.total >= WATER_MAJOR_MIN) &&
      wpct >= WATER_MIN_PCT && wpct <= WATER_MAX_PCT;
  }
  function cleanIsolatedWater() {
    var x, y;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      if (terrain[idx(x, y)] !== 3) continue;
      var allLand = true;
      for (var ey = -1; ey <= 1 && allLand; ey++) for (var ex = -1; ex <= 1 && allLand; ex++) {
        if (!ex && !ey) continue;
        if (terrain[idx(x + ex, y + ey)] === 3) allLand = false;
      }
      if (allLand) terrain[idx(x, y)] = 0;
    }
  }

  function playableCount() {
    var n = 0;
    for (var i = 0; i < terrain.length; i++) if (terrain[i] !== 3) n++;
    return n;
  }

  function nearestLand(x, y) {
    var best = null, bd = 1e9;
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      if (terrain[idx(xx, yy)] === 3) continue;
      var d = Math.abs(xx - x) + Math.abs(yy - y);
      if (d < bd) { bd = d; best = { x: xx, y: yy }; }
    }
    return best || { x: x, y: y };
  }
  // Capitales repartidas por cuadrantes (no 4 esquinas en rectángulo), separadas
  // y SIEMPRE en la componente mayor de tierra (R-RES: en un mapa con islas,
  // spawnear en un islote = slot muerto sin naval hasta Oleada 2).
  function pickCapitals() {
    var ls = landStats();
    var quads = [
      { x0: 4, x1: (W / 2 - 4) | 0, y0: 4, y1: (H / 2 - 4) | 0 },
      { x0: (W / 2 + 4) | 0, x1: W - 5, y0: 4, y1: (H / 2 - 4) | 0 },
      { x0: 4, x1: (W / 2 - 4) | 0, y0: (H / 2 + 4) | 0, y1: H - 5 },
      { x0: (W / 2 + 4) | 0, x1: W - 5, y0: (H / 2 + 4) | 0, y1: H - 5 }
    ];
    // Orden aleatorio determinista de cuadrantes via rnd().
    for (var s = quads.length - 1; s > 0; s--) {
      var j = (rnd() * (s + 1)) | 0;
      var tmp = quads[s]; quads[s] = quads[j]; quads[j] = tmp;
    }
    var caps = [], qi;
    for (qi = 0; qi < 4; qi++) {
      var q = quads[qi], pt = null;
      for (var t = 0; t < 40; t++) {
        var rx = q.x0 + ((rnd() * (q.x1 - q.x0 + 1)) | 0);
        var ry = q.y0 + ((rnd() * (q.y1 - q.y0 + 1)) | 0);
        var cand = nearestLand(rx, ry);
        var ok = true;
        if (ls.comp[idx(cand.x, cand.y)] !== ls.mayorId) ok = false; // islote: reintenta
        for (var e = 0; ok && e < caps.length; e++) {
          if (Math.hypot(cand.x - caps[e].x, cand.y - caps[e].y) < 16) { ok = false; break; }
        }
        if (ok) { pt = cand; break; }
        pt = cand;
      }
      caps.push(pt);
    }
    return caps;
  }

  // ---------- Capa estática offscreen: textura tierra + agua con profundidad ----------
  var staticLayer = null, staticCtx = null;
  function cellVar(x, y) {
    var h = ((x * 374761393 + y * 668265263) | 0) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
  }
  function waterDepth(x, y) {
    if (terrain[idx(x, y)] !== 3) return 0;
    var maxR = (C.VISUAL && C.VISUAL.waterDepthSteps) || 6, best = maxR;
    for (var r = 1; r <= maxR; r++) {
      var found = false;
      for (var dy = -r; dy <= r && !found; dy++) for (var dx = -r; dx <= r && !found; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        var nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        if (terrain[idx(nx, ny)] !== 3) { best = r; found = true; }
      }
      if (found) break;
    }
    return best / maxR;
  }
  function buildStaticLayer() {
    if (typeof document === 'undefined') return;
    if (!staticLayer) { staticLayer = document.createElement('canvas'); staticCtx = staticLayer.getContext('2d'); }
    staticLayer.width = W * CELL; staticLayer.height = H * CELL;
    var V = C.VISUAL || {};
    var base = V.landBase || [104, 102, 58], vv = V.landVar || 22;
    var sh = V.waterShallow || [20, 64, 102], dp = V.waterDeep || [4, 20, 38];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var t = terrain[idx(x, y)], px = x * CELL, py = y * CELL;
      if (t === 3) {
        var d = waterDepth(x, y);
        var r = Math.round(sh[0] + (dp[0] - sh[0]) * d);
        var g = Math.round(sh[1] + (dp[1] - sh[1]) * d);
        var b2 = Math.round(sh[2] + (dp[2] - sh[2]) * d);
        staticCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b2 + ')';
        staticCtx.fillRect(px, py, CELL, CELL);
        // Brillo sutil de costa.
        if (d <= 0.2) { staticCtx.fillStyle = 'rgba(125,211,252,0.18)'; staticCtx.fillRect(px, py, CELL, 2); }
      } else {
        var h = cellVar(x, y), h2 = cellVar(y + 57, x + 131);
        var shadeK = t === 0 ? 0 : t === 1 ? -14 : -26;
        var rr = Math.round(base[0] + (h - 0.5) * 2 * vv + shadeK + (h2 - 0.5) * 10);
        var gg = Math.round(base[1] + (h2 - 0.5) * 2 * vv + shadeK);
        var bb = Math.round(base[2] + (h - 0.5) * vv + shadeK * 1.4);
        rr = Math.max(40, Math.min(200, rr)); gg = Math.max(40, Math.min(200, gg)); bb = Math.max(20, Math.min(140, bb));
        staticCtx.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
        staticCtx.fillRect(px, py, CELL, CELL);
        // Moteado: 2 px de variación para grano orgánico.
        staticCtx.fillStyle = h > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)';
        staticCtx.fillRect(px + ((h * 97) | 0) % (CELL - 2), py + ((h2 * 57) | 0) % (CELL - 2), 2, 2);
      }
    }
  }

  // ---------- Setup ----------
  // Un intento de mundo: terreno+rnd, capitales, ciudades y canales QD-003.
  // Consume el stream de rnd() (cada intento da un mapa distinto) y reasigna
  // todo el estado de mundo (terrain/grid/players/cities); sin DOM ni timers.
  function buildWorldOnce(humanFaction) {
    genTerrain();
    grid = new Int8Array(W * H).fill(-1);
    for (var i = 0; i < grid.length; i++) if (terrain[i] === 3) grid[i] = -3;
    players = []; fighters = []; aaList = []; bunkers = []; attacks = []; cities = [];
    var factions = ['terran', 'zerg', 'protoss'];
    var picks = [humanFaction];
    for (var k = 1; k < 4; k++) picks.push(factions[(factions.indexOf(humanFaction) + k) % 3]);
    var caps = pickCapitals();
    // Asegurar tierra bajo capitales (isla 5x5 de llanura, QD-002).
    caps.forEach(function (c) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var x = c.x + dx, y = c.y + dy;
        if (inBounds(x, y)) { terrain[idx(x, y)] = 0; grid[idx(x, y)] = -1; }
      }
    });
    for (var p = 0; p < 4; p++) {
      players.push({
        idx: p, factionId: picks[p], isHuman: p === 0,
        troops: C.START_TROOPS, alive: true, kills: 0,
        territory: 0, cities: 0, capital: caps[p],
        confirmed: p !== 0, // bots: auto-spawn confirmado; humano elige en fase spawn
        fightersSent: 0, aaBuilt: 0, bunkersBuilt: 0
      });
    }
    players.forEach(function (pl) {
      if (!pl.confirmed) return; // el humano pinta al elegir punto (chooseSpawn)
      paintCapital(pl);
    });
    placeCities();
    connectWaterMajor(); // QD-003: agua conectada (>=60% en componente mayor).
    cleanIsolatedWater();
    fixIslandCapitals(); // el carve QD-003 puede aislar una capital: reubica.
  }
  // Post-carve: ninguna capital puede quedar fuera del continente (slot muerto
  // sin naval). Mueve al mainland más cercano (determinista, sin rnd).
  function fixIslandCapitals() {
    var ls = landStats(), moved = false, i;
    players.forEach(function (pl) {
      if (ls.comp[idx(pl.capital.x, pl.capital.y)] === ls.mayorId) return;
      var best = null, bd = 1e9;
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var ii = idx(x, y);
        if (terrain[ii] === 3 || ls.comp[ii] !== ls.mayorId) continue;
        var dd = Math.abs(x - pl.capital.x) + Math.abs(y - pl.capital.y);
        if (dd < bd) { bd = dd; best = { x: x, y: y }; }
      }
      if (!best) return;
      if (pl.confirmed) unpaintCapital(pl);
      pl.capital = best;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var x = best.x + dx, y = best.y + dy;
        if (inBounds(x, y)) { terrain[idx(x, y)] = 0; grid[idx(x, y)] = -1; }
      }
      if (pl.confirmed) paintCapital(pl);
      moved = true;
    });
    if (moved) { cleanIsolatedWater(); }
  }
  function buildWorld(humanFaction) {
    for (var a = 0; a < WORLD_ATTEMPTS; a++) {
      buildWorldOnce(humanFaction);
      if (worldOk()) return;
    }
    // Probabilidad ≈1e-22 (medida): se acepta el último candidato.
  }
  function paintCapital(pl) {
    var cx = pl.capital.x, cy = pl.capital.y;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = cx + dx, y = cy + dy;
      if (inBounds(x, y) && terrain[idx(x, y)] !== 3) grid[idx(x, y)] = pl.idx;
    }
    // Ciudades bajo la 3x3 pasan al dueño (caso borde al mover spawn).
    cities.forEach(function (c) {
      if (Math.abs(c.x - cx) <= 1 && Math.abs(c.y - cy) <= 1 && c.owner === -1) c.owner = pl.idx;
    });
  }
  function unpaintCapital(pl) {
    var cx = pl.capital.x, cy = pl.capital.y;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = cx + dx, y = cy + dy;
      if (inBounds(x, y) && grid[idx(x, y)] === pl.idx) grid[idx(x, y)] = -1;
    }
    cities.forEach(function (c) {
      if (Math.abs(c.x - cx) <= 1 && Math.abs(c.y - cy) <= 1 && c.owner === pl.idx) c.owner = -1;
    });
  }
  // Fase spawn elegible (R-SPAWN lote 1a): el humano elige punto con click en
  // tierra libre (bots: auto-spawn intacto). Sin confirmar al cierre => el
  // candidato aleatorio inicial se confirma solo.
  function chooseSpawn(plIdx, tx, ty) {
    var pl = players[plIdx];
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (phase !== 'spawn') return { ok: false, reason: 'la fase de spawn ya cerró' };
    if (!inBounds(tx, ty)) return { ok: false, reason: 'fuera de mapa' };
    if (terrain[idx(tx, ty)] === 3) return { ok: false, reason: 'agua: elige tierra libre' };
    if (grid[idx(tx, ty)] !== -1) return { ok: false, reason: 'celda ocupada: elige tierra libre' };
    for (var i = 0; i < players.length; i++) {
      if (i === plIdx || !players[i].confirmed) continue;
      if (Math.hypot(tx - players[i].capital.x, ty - players[i].capital.y) < 10) {
        return { ok: false, reason: 'muy cerca de otro spawn' };
      }
    }
    if (pl.confirmed) unpaintCapital(pl);
    var mainland = landStats();
    var isle = mainland.comp[idx(tx, ty)] !== mainland.mayorId;
    pl.capital = { x: tx, y: ty };
    // Isla 3x3 de llanura bajo el punto (igual que capitales auto).
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = tx + dx, y = ty + dy;
      if (inBounds(x, y)) { terrain[idx(x, y)] = 0; grid[idx(x, y)] = -1; }
    }
    pl.confirmed = true;
    paintCapital(pl);
    recount();
    if (isle) say('⚠️ Islote sin conexión terrestre: expandirás por mar (Oleada 2).');
    return { ok: true };
  }
  function closeSpawn() {
    if (phase !== 'spawn') return;
    var me = players[0];
    if (me && !me.confirmed) { me.confirmed = true; paintCapital(me); }
    phase = 'play';
    spawnCloseTick = tickCount;
    recount();
    say('🕊 Inmunidad 5 s: expande a neutral, los jugadores no se dañan.');
  }
  function newGame(humanFaction, seedOpt) {
    stopLoop();
    pausedFlag = false; // QD-001: reinicio siempre reanuda (botón ⏸).
    if (btnPauseEl) btnPauseEl.textContent = '⏸';
    var seed = (typeof seedOpt === 'number') ? (seedOpt | 0) : ((Math.random() * 1e9) | 0);
    srand(seed); simSeed = seed; // El stream avanza un intento: determinista por semilla.
    if (typeof document !== 'undefined') {
      var sel = document.getElementById('sel-diff');
      if (sel && sel.value) difficulty = sel.value;
    }
    buildWorld(humanFaction); // FIX5(a): reintenta hasta teatro único válido.
    botCd = [0, 0, 0, 0]; // FIX3: sin residual entre partidas (determinismo + pacing).
    gameOver = null; tickCount = 0; attackSeq = 1;
    phase = 'spawn'; spawnCloseTick = 0;
    selected = { x: -1, y: -1 };
    recount();
    buildStaticLayer();
    running = true; runId++;
    var myRun = runId;
    hideOverlay();
    say('📍 Fase spawn: click en tierra libre para tu punto (cierre auto en 10 s).');
    lastTime = performance.now();
    tickTimer = setInterval(simTick, C.TICK_MS);
    requestAnimationFrame(function (t) { render(t, myRun); });
    updateHUD(); renderBoard();
  }
  function stopLoop() { running = false; if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  // QD-001: pausa/reanudación centralizadas. resumeGame limpia el timer
  // vigente antes de crear uno nuevo (evita sim a 2x tras pausa+reinicio).
  function pauseGame() {
    pausedFlag = true; stopLoop();
    if (btnPauseEl) btnPauseEl.textContent = '▶';
  }
  function resumeGame() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    pausedFlag = false; running = true;
    tickTimer = setInterval(simTick, C.TICK_MS);
    if (btnPauseEl) btnPauseEl.textContent = '⏸';
  }

  function placeCities() {
    var tries = 0;
    while (cities.length < C.N_CITIES && tries < 800) {
      tries++;
      var x = 8 + ((rnd() * (W - 16)) | 0), y = 7 + ((rnd() * (H - 14)) | 0);
      if (terrain[idx(x, y)] === 3) continue;
      var ok = true, j;
      for (j = 0; j < players.length; j++) {
        if (Math.hypot(x - players[j].capital.x, y - players[j].capital.y) < 9) { ok = false; break; }
      }
      for (j = 0; j < cities.length && ok; j++) {
        if (Math.hypot(x - cities[j].x, y - cities[j].y) < 10) ok = false;
      }
      if (!ok) continue;
      // Tierra 3x3 alrededor.
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var cx = x + dx, cy = y + dy;
        if (inBounds(cx, cy) && terrain[idx(cx, cy)] === 3) { terrain[idx(cx, cy)] = 0; grid[idx(cx, cy)] = -1; }
      }
      cities.push({ x: x, y: y, owner: -1 });
    }
  }
  function cityAt(x, y) {
    for (var i = 0; i < cities.length; i++) if (cities[i].x === x && cities[i].y === y) return cities[i];
    return null;
  }

  function recount() {
    players.forEach(function (pl) { pl.territory = 0; pl.cities = 0; });
    for (var i = 0; i < grid.length; i++) {
      var o = grid[i];
      if (o >= 0 && players[o]) players[o].territory++;
    }
    cities.forEach(function (c) { if (c.owner >= 0 && players[c.owner]) players[c.owner].cities++; });
  }
  // Dificultades (spec tabla): los bots juegan con cap/3 (BOT_CAP_DIV) y su
  // generacion/ataque se multiplica por la dificultad del lobby (humano x1.0).
  function diffMult(pl) {
    if (!pl || pl.isHuman) return 1;
    var opts = (C.DIFFICULTY && C.DIFFICULTY.options) || { media: 0.75 };
    return opts[difficulty] || 0.75;
  }
  function maxOf(pl) {
    var base = BAL.maxTroops(pl.territory, pl.cities, pl.factionId);
    if (pl && !pl.isHuman && C.DIFFICULTY && C.DIFFICULTY.BOT_CAP_DIV) {
      base = Math.round(base / C.DIFFICULTY.BOT_CAP_DIV);
    }
    return base;
  }

  // ---------- Defensa / escudo ----------
  function shieldDensity(pl) {
    if (!pl || pl.territory <= 0) return 0;
    return (pl.troops / pl.territory) * 10;
  }
  function isCapitalCell(x, y) {
    for (var i = 0; i < players.length; i++) {
      var c = players[i].capital;
      if (Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1) return players[i];
    }
    return null;
  }
  function aaOnCell(x, y) {
    for (var i = 0; i < aaList.length; i++) if (aaList[i].x === x && aaList[i].y === y) return aaList[i];
    return null;
  }
  function bunkerAt(x, y) {
    for (var i = 0; i < bunkers.length; i++) if (bunkers[i].x === x && bunkers[i].y === y) return bunkers[i];
    return null;
  }
  function bunkerSpec(pl) { return C.BUNKERS[pl.factionId]; }
  function defenseOfCell(tx, ty) {
    var o = ownerAt(tx, ty);
    if (o === -1) {
      var ct = cityAt(tx, ty);
      return ct ? C.CITY_DEF : C.NEUTRAL_DEF;
    }
    if (o < 0) return 9999;
    var pl = players[o];
    // R-RES: base 8->14; con frentes 2x más rápidos la defensa colapsaba y el
    // humano scriptado moría ~60 s (lobby congelado). Jugadores duros, neutral igual.
    var base = 14 + shieldDensity(pl) / 10 * C.FACTIONS[pl.factionId].defMult;
    var cap = isCapitalCell(tx, ty);
    if (cap && cap.idx === o) base *= C.CAPITAL_DEF_MULT;
    var aa = aaOnCell(tx, ty);
    if (aa) base += aa.hp * 0.5;
    var bk = bunkerAt(tx, ty); // R-BUNKER: defensa extra en su celda por nivel
    if (bk && o >= 0 && bk.owner === o) base += bunkerSpec(players[bk.owner]).defBonus[bk.level - 1];
    return base;
  }

  // ---------- Ataques sostenidos ----------
  function nearestBorderCell(plIdx, tx, ty, maxDist) {
    var bx = -1, by = -1, bd = 1e9;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (grid[idx(x, y)] !== plIdx || terrain[idx(x, y)] === 3) continue;
      // Es borde si algún vecino no es mío y no es agua.
      var edge = false;
      var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var nx = x + d4[d][0], ny = y + d4[d][1];
        if (!inBounds(nx, ny)) continue;
        if (terrain[idx(nx, ny)] === 3) continue;
        if (grid[idx(nx, ny)] !== plIdx) { edge = true; break; }
      }
      if (!edge) continue;
      var dist = Math.abs(x - tx) + Math.abs(y - ty);
      if (dist < bd) { bd = dist; bx = x; by = y; }
    }
    if (bx < 0 || bd > (maxDist || 16)) return null;
    return { x: bx, y: by, dist: bd };
  }

  function myAttacks(plIdx) { return attacks.filter(function (a) { return a.owner === plIdx && a.state === 'advance'; }); }

  function launchAttack(plIdx, tx, ty) {
    var pl = players[plIdx];
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (phase !== 'play') return { ok: false, reason: 'fase spawn: elige tu punto primero' };
    if (!inBounds(tx, ty)) return { ok: false, reason: 'fuera de mapa' };
    var ratio = pl.isHuman ? attackRatio : 0.55; // R-RES: bots comprometen más (era 0.3)
    var committed = Math.floor(pl.troops * ratio);
    // Re-click sobre frente propio SUMA tropas (lote 1a §3): cursor a <=2.
    var k;
    for (k = 0; k < attacks.length; k++) {
      var f = attacks[k];
      if (f.owner !== plIdx || f.state !== 'advance') continue;
      if (Math.max(Math.abs(f.cx - tx), Math.abs(f.cy - ty)) <= 2) {
        if (committed < 20) return { ok: false, reason: 'pocas tropas, baja el % o espera' };
        pl.troops -= committed;
        f.troops += committed;
        return { ok: true, reinforced: f.id };
      }
    }
    if (terrain[idx(tx, ty)] === 3) return { ok: false, reason: 'agua: rodea o bombardea' };
    if (grid[idx(tx, ty)] === plIdx) return { ok: false, reason: 'ya es tuya' };
    var cap = BAL.frontCap(pl.territory);
    if (myAttacks(plIdx).length >= cap) return { ok: false, reason: 'máx ' + cap + ' frentes (X para retirar)' };
    var from = nearestBorderCell(plIdx, tx, ty, 32); // R-RES: mapa mayor, alcance 16->32
    if (!from) return { ok: false, reason: 'sin frontera cerca: expande paso a paso' };
    if (committed < 20) return { ok: false, reason: 'pocas tropas, baja el % o espera' };
    pl.troops -= committed;
    attacks.push({
      id: attackSeq++, owner: plIdx, state: 'advance',
      cx: from.x, cy: from.y, tx: tx, ty: ty,
      troops: committed, cool: 0, retTreat: 0, gained: 0, slow: 0, born: tickCount,
      foe: grid[idx(tx, ty)] >= 0 // CA-P5: penalización solo si el objetivo era jugador
    });
    return { ok: true };
  }
  // Compat: la spec v1 llamaba tryGroundAttack (instantáneo). Ahora lanza sostenido.
  function tryGroundAttack(plIdx, tx, ty) { return launchAttack(plIdx, tx, ty); }

  function retreatAttack(plIdx, id) {
    var list = attacks.filter(function (a) { return a.owner === plIdx && a.state === 'advance'; });
    var a = id ? list.filter(function (x) { return x.id === id; })[0] : list[list.length - 1];
    if (!a) return { ok: false, reason: 'no hay ataques activos' };
    a.state = 'retreat'; a.retTreat = C.RETREAT_DELAY_TICKS;
    say('↩ Retirada en 2 s (recuperas 75%)…');
    return { ok: true };
  }

  function nextCellFor(a) {
    // Greedy hacia el objetivo: vecinas no-mías no-agua, prefiere mismo dueño que el objetivo y llanura.
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var want = ownerAt(a.tx, a.ty);
    var best = null, bs = -1e9;
    for (var d = 0; d < dirs.length; d++) {
      var nx = a.cx + dirs[d][0], ny = a.cy + dirs[d][1];
      if (!inBounds(nx, ny) || terrain[idx(nx, ny)] === 3) continue;
      var o = grid[idx(nx, ny)];
      if (o === a.owner) continue;
      var t = terrain[idx(nx, ny)];
      var s = 0;
      if (o === want) s += 6;
      if (o === -1) s += 4;
      s += (2 - t) * 1.5;
      s -= Math.abs(nx - a.tx) + Math.abs(ny - a.ty) * 0.2;
      s += rnd() * 1.5;
      if (s > bs) { bs = s; best = { x: nx, y: ny }; }
    }
    return best;
  }

  // Inmunidad SOLO entre jugadores tras el cierre del spawn (neutral conquistable).
  function immune() {
    return phase === 'play' && (tickCount - spawnCloseTick) < C.SPAWN_IMMUNITY_TICKS;
  }
  // R-ANEXIÓN (lote 1a §2): tras conquistar celda de un jugador, sus
  // componentes totalmente cercadas por el atacante (vecinas de tierra solo
  // del atacante; agua = costa/salida) cambian de dueño al instante y sin
  // pérdidas del defensor. Cubre cerco total y partición en dos.
  // La capital NUNCA voltea por cerco (cae por asalto): evita eliminaciones
  // instantáneas con transmisión del imperio entero por un bolsón con capital.
  function checkAnnex(attIdx, vicIdx) {
    if (attIdx === vicIdx || vicIdx < 0 || !players[vicIdx]) return 0;
    var seen = new Uint8Array(W * H), flipped = 0, flippedCells = [], ci;
    for (ci = 0; ci < grid.length; ci++) {
      if (grid[ci] !== vicIdx || seen[ci]) continue;
      // BFS de la componente de la víctima.
      var q = [ci]; seen[ci] = 1; var comp = [], head = 0, enclosed = true;
      while (head < q.length) {
        var c = q[head++]; comp.push(c);
        var cx = c % W, cy = (c / W) | 0;
        var nb = [];
        if (cx > 0) nb.push(c - 1);
        if (cx < W - 1) nb.push(c + 1);
        if (cy > 0) nb.push(c - W);
        if (cy < H - 1) nb.push(c + W);
        for (var n = 0; n < nb.length; n++) {
          var o = grid[nb[n]];
          if (o === vicIdx) { if (!seen[nb[n]]) { seen[nb[n]] = 1; q.push(nb[n]); } }
          // R-ANEXIÓN "bolsón SIN costa": el agua es salida (tiene costa),
          // igual que la tierra ajena. Solo el atacante + borde cercan.
          else if (terrain[nb[n]] === 3 || o !== attIdx) enclosed = false;
        }
      }
      if (enclosed && comp.length > 0) {
        var capIdx = players[vicIdx] ? idx(players[vicIdx].capital.x, players[vicIdx].capital.y) : -1;
        for (var f = 0; f < comp.length; f++) {
          if (comp[f] === capIdx) continue; // la capital se asalta, no se anexiona
          grid[comp[f]] = attIdx; flippedCells.push(comp[f]); flipped++;
        }
      }
    }
    if (flipped > 0) {
      var att = players[attIdx];
      var inPocket = {};
      flippedCells.forEach(function (c) { inPocket[c] = true; });
      // Ciudades del bolsón (de la víctima o neutrales) pasan al atacante,
      // igual que al conquistar su celda por asalto.
      cities.forEach(function (ct) {
        if (inPocket[idx(ct.x, ct.y)] && (ct.owner === vicIdx || ct.owner === -1)) ct.owner = attIdx;
      });
      aaList = aaList.filter(function (a) {
        return !(a.owner === vicIdx && grid[idx(a.x, a.y)] === attIdx);
      });
      bunkers = bunkers.filter(function (b) {
        return !(b.owner === vicIdx && grid[idx(b.x, b.y)] === attIdx);
      });
      if (att) att.kills += flipped;
      recount();
      checkElimination(players[vicIdx]); // la capital pudo quedar en el bolsón
    }
    return flipped;
  }

  function stepAttack(a) {
    var pl = players[a.owner];
    if (!pl || !pl.alive) { a.dead = true; return; }
    if (a.state === 'retreat') {
      a.retTreat--;
      if (a.retTreat <= 0) {
        var back = a.foe ? C.RETREAT_RETURN_MULT : 1; // 0% vs neutral (R-RETIRADA)
        pl.troops = Math.min(maxOf(pl), pl.troops + a.troops * back);
        a.dead = true;
      }
      return;
    }
    if (a.cool > 0) { a.cool--; return; }
    if (a.troops < 5) { a.dead = true; return; }
    var cell = nextCellFor(a);
    if (!cell) { // Sin frente: devuelve resto parcial.
      pl.troops = Math.min(maxOf(pl), pl.troops + a.troops * 0.5);
      a.dead = true; return;
    }
    var t = terrain[idx(cell.x, cell.y)];
    var o = grid[idx(cell.x, cell.y)];
    var def = defenseOfCell(cell.x, cell.y);
    // R-EXP: potencia superlineal (x dificultades en bots).
    var atkP = BAL.expPower(a.troops, pl.territory, C.FACTIONS[pl.factionId].atkMult) * diffMult(pl);
    var defender = o >= 0 ? players[o] : null;
    var wins = BAL.resolveGroundAssault(atkP, def, defender ? defender.factionId : null);
    var lossMult = C.TERRAIN.atkLossMult[t];
    var atkLoss = Math.max(2, def * lossMult / C.FACTIONS[pl.factionId].atkMult * 0.9 + 1) *
      BAL.expLossMult(a.troops);
    if (immune() && o >= 0) { a.cool = 2; return; } // Inmunidad: solo neutral.
    if (wins) {
      var prev = o;
      grid[idx(cell.x, cell.y)] = a.owner;
      a.cx = cell.x; a.cy = cell.y; a.gained++;
      a.troops -= atkLoss;
      var bk0 = bunkerAt(cell.x, cell.y); // asalto: el búnker cae con su celda
      if (bk0) bunkers.splice(bunkers.indexOf(bk0), 1);
      var ct0 = cityAt(cell.x, cell.y);
      if (ct0 && prev !== a.owner) { ct0.owner = a.owner; say('⬢ Ciudad capturada (' + C.FACTIONS[pl.factionId].cityName + ') +cap'); }
      recount();
      if (defender) {
        defender.troops = Math.max(0, defender.troops - def * 0.9);
        checkElimination(defender);
      }
      pl.kills++;
      a.cool = C.TERRAIN.ticksPerTile[t] * ((o >= 0) ? 2 : 1);
      if (a.slow > 0) { a.cool = a.cool + 1 + Math.ceil(a.cool * a.slow); a.slow = 0; } // repelencia (+1: frena hasta en llanura)
      if (isCapitalCell(cell.x, cell.y) && prev >= 0) checkElimination(players[prev]);
      if (prev >= 0 && prev !== a.owner && players[prev]) checkAnnex(a.owner, prev); // R-ANEXIÓN
      recount(); checkVictory();
      if (a.troops < 5) {
        pl.troops = Math.min(maxOf(pl), pl.troops + Math.max(a.troops, 0));
        a.dead = true;
      }
    } else {
      a.troops -= atkLoss * 0.7;
      if (defender) defender.troops = Math.max(0, defender.troops - atkLoss * 0.25);
      a.cool = C.TERRAIN.ticksPerTile[t] + 1;
      if (a.slow > 0) { a.cool = a.cool + 1 + Math.ceil(a.cool * a.slow); a.slow = 0; }
      if (a.troops < 8) { a.dead = true; return; }
    }
  }

  function checkElimination(pl) {
    var c = pl.capital;
    var centerOwner = grid[idx(c.x, c.y)];
    if (centerOwner !== pl.idx || pl.territory <= 0) {
      if (pl.alive) {
        pl.alive = false;
        // Transmisión al ejecutor (dueño de la capital al caer): sin ella cada
        // muerte vaporizaba ~15-25% del mapa a neutral y el T2 (60% a 180 s)
        // era inalcanzable en cuanto moría alguien. Sin ejecutor: neutral.
        var killer = (centerOwner >= 0 && players[centerOwner] && players[centerOwner].alive && centerOwner !== pl.idx) ? centerOwner : -1;
        for (var i = 0; i < grid.length; i++) if (grid[i] === pl.idx) grid[i] = killer;
        cities.forEach(function (ct) { if (ct.owner === pl.idx) ct.owner = killer; });
        fighters = fighters.filter(function (f) { return f.owner !== pl.idx; });
        aaList = aaList.filter(function (x) { return x.owner !== pl.idx; });
        bunkers = bunkers.filter(function (x) { return x.owner !== pl.idx; });
        attacks.forEach(function (a) { if (a.owner === pl.idx) a.dead = true; });
        pl.troops = 0;
        recount();
        say(C.FACTIONS[pl.factionId].name + ' (J' + (pl.idx + 1) + ') eliminado.' +
          (killer >= 0 ? ' Sus restos pasan a J' + (killer + 1) + '.' : ''));
        checkVictory();
      }
    }
  }

  // ---------- Aire / AA (igual que v1, +ciudades) ----------
  function fighterCost(pl) { return BAL.airOf(pl.factionId, C.FACTIONS[pl.factionId]).cost; }
  function aaCost(pl) { return BAL.aaOf(pl.factionId, C.FACTIONS[pl.factionId]).cost; }

  function sendFighter(plIdx, tx, ty) {
    var pl = players[plIdx];
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (!inBounds(tx, ty)) return { ok: false, reason: 'fuera de mapa' };
    var n = fighters.filter(function (f) { return f.owner === plIdx; }).length;
    if (n >= C.MAX_FIGHTERS) return { ok: false, reason: 'máx ' + C.MAX_FIGHTERS + ' cazas' };
    var spec = BAL.airOf(pl.factionId, C.FACTIONS[pl.factionId]);
    if (pl.troops < spec.cost) return { ok: false, reason: 'tropas insuficientes (' + Math.floor(pl.troops) + '/' + spec.cost + ')' };
    pl.troops -= spec.cost; pl.fightersSent++;
    fighters.push({
      owner: plIdx, factionId: pl.factionId, x: pl.capital.x, y: pl.capital.y,
      sx: pl.capital.x, sy: pl.capital.y, tx: tx, ty: ty,
      hp: spec.hp, maxHp: spec.hp, shield: spec.shield || 0,
      speed: spec.speed, bombDamage: spec.bombDamage, bombRadius: spec.bombRadius,
      airDps: spec.airDps, state: 'fly', age: 0, bombCd: 0, orbitT: 12,
      atkMult: C.FACTIONS[pl.factionId].atkMult
    });
    return { ok: true };
  }
  function buildAA(plIdx, tx, ty) {
    var pl = players[plIdx];
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (!inBounds(tx, ty) || isWater(tx, ty)) return { ok: false, reason: 'celda inválida' };
    if (grid[idx(tx, ty)] !== plIdx) return { ok: false, reason: 'la AA solo va en tu territorio' };
    if (aaOnCell(tx, ty)) return { ok: false, reason: 'ya hay AA aquí' };
    var mine = aaList.filter(function (a) { return a.owner === plIdx; }).length;
    if (mine >= C.MAX_AA) return { ok: false, reason: 'máx ' + C.MAX_AA + ' AA' };
    var spec = BAL.aaOf(pl.factionId, C.FACTIONS[pl.factionId]);
    if (pl.troops < spec.cost) return { ok: false, reason: 'tropas insuficientes (' + Math.floor(pl.troops) + '/' + spec.cost + ')' };
    pl.troops -= spec.cost; pl.aaBuilt++;
    aaList.push({ owner: plIdx, factionId: pl.factionId, x: tx, y: ty, hp: spec.hp, maxHp: spec.hp, range: spec.range, dps: spec.dps });
    return { ok: true };
  }
  // R-BUNKER: edificio anti-TIERRA en autonomo (rol inverso a la AA: al aire ni lo mira).
  function buildBunker(plIdx, tx, ty) {
    var pl = players[plIdx];
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (phase !== 'play') return { ok: false, reason: 'fase spawn: elige tu punto primero' };
    if (!inBounds(tx, ty) || isWater(tx, ty)) return { ok: false, reason: 'celda inválida' };
    if (grid[idx(tx, ty)] !== plIdx) return { ok: false, reason: 'el búnker solo va en tu territorio' };
    if (bunkerAt(tx, ty)) return { ok: false, reason: 'ya hay búnker aquí' };
    var mine = bunkers.filter(function (b) { return b.owner === plIdx; }).length;
    if (mine >= C.MAX_BUNKERS) return { ok: false, reason: 'máx ' + C.MAX_BUNKERS + ' búnkeres' };
    var spec = bunkerSpec(pl);
    if (pl.troops < spec.cost) return { ok: false, reason: 'tropas insuficientes (' + Math.floor(pl.troops) + '/' + spec.cost + ')' };
    pl.troops -= spec.cost; pl.bunkersBuilt++;
    bunkers.push({ owner: plIdx, factionId: pl.factionId, x: tx, y: ty, level: 1, hp: spec.hp[0], maxHp: spec.hp[0] });
    return { ok: true };
  }
  function upgradeBunker(plIdx, tx, ty) {
    var pl = players[plIdx];
    var b = bunkerAt(tx, ty);
    if (!pl || !pl.alive) return { ok: false, reason: 'eliminado' };
    if (!b || b.owner !== plIdx) return { ok: false, reason: 'no hay búnker propio aquí' };
    if (b.level >= 3) return { ok: false, reason: 'nivel máximo (3)' };
    var spec = bunkerSpec(pl);
    var cost = spec.upgrades[b.level - 1];
    if (pl.troops < cost) return { ok: false, reason: 'tropas insuficientes (' + Math.floor(pl.troops) + '/' + cost + ')' };
    pl.troops -= cost;
    b.level++;
    b.hp = spec.hp[b.level - 1]; b.maxHp = spec.hp[b.level - 1];
    return { ok: true };
  }
  // Dano autonomo por tick a frentes terrestres enemigos con cursor en rango
  // + slow de avance. Sin rnd(): determinista. dps en config = por segundo.
  function bunkerTick() {
    var k;
    for (k = 0; k < attacks.length; k++) attacks[k].slow = 0;
    for (var i = 0; i < bunkers.length; i++) {
      var b = bunkers[i];
      if (!players[b.owner] || !players[b.owner].alive) continue;
      var spec = bunkerSpec(players[b.owner]);
      var r = spec.range[b.level - 1], dps = spec.dps[b.level - 1], slow = spec.slow[b.level - 1];
      for (k = 0; k < attacks.length; k++) {
        var a = attacks[k];
        if (a.owner === b.owner || a.state !== 'advance') continue;
        var dx = a.cx - b.x, dy = a.cy - b.y;
        if (dx * dx + dy * dy <= r * r) {
          a.troops -= dps * (C.TICK_MS / 1000);
          if (slow > (a.slow || 0)) a.slow = slow;
        }
      }
    }
  }
  function damageFighter(f, dmg) {
    if (f.shield > 0) { var ab = Math.min(f.shield, dmg); f.shield -= ab; dmg -= ab; }
    f.hp -= dmg;
  }
  function bombAt(f) {
    var cx = Math.round(f.x), cy = Math.round(f.y), r = f.bombRadius, ownersHit = {};
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var x = cx + dx, y = cy + dy;
      if (!inBounds(x, y) || dx * dx + dy * dy > r * r + 1) continue;
      var o = grid[idx(x, y)];
      if (o >= 0 && o !== f.owner) ownersHit[o] = true;
    }
    Object.keys(ownersHit).forEach(function (k) {
      var vp = players[+k];
      if (vp && vp.alive) vp.troops = Math.max(0, vp.troops - f.bombDamage * 0.6);
    });
    var o0 = ownerAt(cx, cy);
    if (o0 !== f.owner && o0 !== -9 && o0 !== -3 && terrain[idx(cx, cy)] !== 3) {
      var atk = f.bombDamage * f.atkMult;
      var def = defenseOfCell(cx, cy) * 0.8;
      if (BAL.resolveGroundAssault(atk, def, o0 >= 0 ? players[o0].factionId : null)) {
        var aa = aaOnCell(cx, cy);
        var bk = bunkerAt(cx, cy);
        if (aa && aa.owner !== f.owner) { aa.hp -= f.bombDamage; if (aa.hp <= 0) aaList.splice(aaList.indexOf(aa), 1); }
        else if (bk && bk.owner !== f.owner) { bk.hp -= f.bombDamage; if (bk.hp <= 0) bunkers.splice(bunkers.indexOf(bk), 1); }
        else {
          grid[idx(cx, cy)] = f.owner;
          var ct = cityAt(cx, cy);
          if (ct) ct.owner = f.owner;
          if (o0 >= 0) { players[o0].troops = Math.max(0, players[o0].troops - f.bombDamage * 0.4); checkElimination(players[o0]); }
          recount(); checkVictory();
        }
      }
    }
  }

  // ---------- Sim ----------
  function simTick() {
    if (!running || gameOver) return;
    tickCount++;
    if (phase === 'spawn') { // elección de punto: sim congelada hasta el cierre
      if (tickCount >= C.SPAWN_PHASE_TICKS) closeSpawn();
      updateHUD();
      return;
    }
    players.forEach(function (pl) {
      if (!pl.alive) return;
      var mx = maxOf(pl);
      var g = BAL.growthPerTick(pl.troops, mx, C.FACTIONS[pl.factionId].genMult * diffMult(pl)) + pl.cities * C.CITY_GEN * 0.1;
      pl.troops = Math.min(mx, pl.troops + g);
    });
    var dt = C.TICK_MS / 1000, i;
    bunkerTick(); // R-BUNKER: daño autónomo + slow antes de mover frentes
    attacks.forEach(stepAttack);
    attacks = attacks.filter(function (a) { return !a.dead && a.troops > 0; });
    for (i = fighters.length - 1; i >= 0; i--) {
      var f = fighters[i];
      f.age += dt;
      if (f.age > C.FIGHTER_LIFETIME_S || f.hp <= 0) { fighters.splice(i, 1); continue; }
      if (f.state === 'fly') {
        var dx = f.tx - f.x, dy = f.ty - f.y, dist = Math.sqrt(dx * dx + dy * dy), step = f.speed * dt;
        if (dist <= Math.max(step, 0.4)) { f.x = f.tx; f.y = f.ty; f.state = 'orbit'; }
        else { f.x += dx / dist * step; f.y += dy / dist * step; }
      } else if (f.state === 'orbit') {
        f.orbitT -= dt;
        var t = f.age * 1.5;
        f.x = f.tx + Math.cos(t) * 1.5; f.y = f.ty + Math.sin(t) * 1.5;
        f.bombCd -= dt;
        if (f.bombCd <= 0) { bombAt(f); f.bombCd = C.BOMB_TICK_S; }
        if (f.orbitT <= 0) f.state = 'return';
      } else {
        var rx = f.sx - f.x, ry = f.sy - f.y, rd = Math.sqrt(rx * rx + ry * ry), rs = f.speed * dt;
        if (rd <= Math.max(rs, 0.4)) { fighters.splice(i, 1); continue; }
        else { f.x += rx / rd * rs; f.y += ry / rd * rs; }
      }
      for (var a = 0; a < aaList.length; a++) {
        var aa = aaList[a];
        if (aa.owner === f.owner) continue;
        var adx = aa.x - f.x, ady = aa.y - f.y;
        if (Math.sqrt(adx * adx + ady * ady) <= aa.range) damageFighter(f, aa.dps * dt);
      }
      if (f.hp <= 0) fighters.splice(i, 1);
    }
    for (var m = 0; m < fighters.length; m++) for (var n = m + 1; n < fighters.length; n++) {
      var A = fighters[m], B = fighters[n];
      if (A.owner === B.owner) continue;
      var ddx = A.x - B.x, ddy = A.y - B.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) <= C.AIR_VS_AIR_RANGE) {
        damageFighter(A, B.airDps * dt); damageFighter(B, A.airDps * dt);
      }
    }
    fighters = fighters.filter(function (f) { return f.hp > 0; });
    if (tickCount % 6 === 0) botTick(); // R-RES: cadencia de bots al alza (era 8)
    players.forEach(function (pl) { if (pl.alive && pl.territory <= 0) checkElimination(pl); });
    updateHUD();
  }

  // ---------- Bots v2 ----------
  var botCd = [0, 0, 0, 0];
  function botTick() {
    players.forEach(function (pl) {
      if (pl.isHuman || !pl.alive || gameOver) return;
      // Expandir: ciudad neutral cercana o frontera neutral en llanura.
      // Reserva mínima 150 (medido: escalarla por territorio dejaba a los
      // bots pasivos y bajaba T2). Sin pool no hay escudo: la reserva evita
      // muertes en cadena que hunden la ocupación.
      var tgt = nearestCityTarget(pl) || botFrontier(pl);
      if (tgt && pl.troops > 150 && botWorthIt(pl, tgt.x, tgt.y) &&
          myAttacks(pl.idx).length < C.MAX_ATTACKS_PER_PLAYER && !launchAttack(pl.idx, tgt.x, tgt.y).ok) {
        var fb = botFrontier(pl); // FIX1: si la ciudad queda fuera de alcance, frontera en vez de quedarse parado.
        if (fb && botWorthIt(pl, fb.x, fb.y)) launchAttack(pl.idx, fb.x, fb.y);
      }
      // Retirada si un ataque pierde fuelle o tapona un slot moliendo sin
      // avanzar (recicla tropas al pool en vez de quemarlas en guerras de
      // desgaste; el slot libre rinde más que un frente a 0.05 celdas/tick).
      attacks.forEach(function (a) {
        if (a.owner !== pl.idx || a.state !== 'advance') return;
        if (a.troops < 12 && a.gained < 2) { a.state = 'retreat'; a.retTreat = 10; }
        else if (a.born && tickCount - a.born > 30 && a.gained < 8) { a.state = 'retreat'; a.retTreat = 10; }
      });
      var enemyAir = fighters.some(function (f) {
        return f.owner !== pl.idx && Math.hypot(f.x - pl.capital.x, f.y - pl.capital.y) < 12;
      });
      var myAA = aaList.filter(function (x) { return x.owner === pl.idx; }).length;
      if (enemyAir && myAA < 6 && pl.troops > aaCost(pl) + 100) {
        var spot = freeOwnCellNear(pl, pl.capital.x, pl.capital.y, 4);
        if (spot) buildAA(pl.idx, spot.x, spot.y);
      } else if (myAA < 2 && pl.troops > 600 && tickCount > 300) {
        var s2 = freeOwnCellNear(pl, pl.capital.x, pl.capital.y, 3);
        if (s2) buildAA(pl.idx, s2.x, s2.y);
      }
      var underPressure = attacks.some(function (a) { // R-BUNKER: gatillo de construcción
        return a.owner !== pl.idx && a.state === 'advance' &&
          (ownerAt(a.tx, a.ty) === pl.idx ||
            Math.hypot(a.cx - pl.capital.x, a.cy - pl.capital.y) < 14);
      });
      var myBunkers = bunkers.filter(function (x) { return x.owner === pl.idx; });
      var bSpec = bunkerSpec(pl);
      if (underPressure || (tickCount > 900 && myBunkers.length === 0 && pl.troops > bSpec.cost * 2)) {
        if (myBunkers.length < C.MAX_BUNKERS && pl.troops > bSpec.cost + 100) {
          var spot = freeOwnCellNear(pl, pl.capital.x, pl.capital.y, 5);
          if (spot) buildBunker(pl.idx, spot.x, spot.y);
        }
        var up = null, ui;
        for (ui = 0; ui < myBunkers.length; ui++) {
          if (myBunkers[ui].level >= 3) continue;
          var uc = bSpec.upgrades[myBunkers[ui].level - 1];
          if (pl.troops > uc + 150 && (!up || myBunkers[ui].level < up.level)) up = myBunkers[ui];
        }
        if (up) upgradeBunker(pl.idx, up.x, up.y);
      }
      botCd[pl.idx] -= 0.8;
      if (botCd[pl.idx] <= 0) {
          botCd[pl.idx] = 20 + rnd() * 15; // cazas: los bots los spameaban y quemaban
          // el combustible de expansión (pools); el ritmo R-RES va por tierra
        if (pl.troops > 450) {
          var alive = players.filter(function (q) { return q.idx !== pl.idx && q.alive; });
          if (alive.length) {
            var q = alive[(rnd() * alive.length) | 0];
            sendFighter(pl.idx, q.capital.x, q.capital.y);
          }
        }
      }
    });
  }
  // No suicidarse: si el objetivo es de un jugador y la potencia estimada no
  // rompe su defensa, se espera y acumula hasta 600 (pool con el que se rompen
  // bordes aunque no capitales). Sin tope, el bot entraba en coma (J1 569
  // parado en 42); sin espera, treadmill quemando (J2 0.07/tick). Vs neutral
  // siempre (barato). Pura, determinista (sin rnd).
  function botWorthIt(pl, tx, ty) {
    var to = ownerAt(tx, ty);
    if (to < 0 || to === pl.idx) return true;
    var estPow = BAL.expPower(Math.floor(pl.troops * 0.55), pl.territory,
      C.FACTIONS[pl.factionId].atkMult) * diffMult(pl);
    return estPow >= defenseOfCell(tx, ty) * 1.1 || pl.troops >= 600;
  }
  function nearestCityTarget(pl) {
    var best = null, bd = 1e9;
    cities.forEach(function (c) {
      if (c.owner === pl.idx) return;
      var from = nearestBorderCell(pl.idx, c.x, c.y, 32); // FIX1+R-RES: igual que launchAttack.
      if (!from) return;
      var d = from.dist;
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  function botFrontier(pl) {
    var best = null, bs = -1e9;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      if (grid[idx(x, y)] !== pl.idx) continue;
      for (var d = 0; d < 4; d++) {
        var nx = x + dirs[d][0], ny = y + dirs[d][1];
        if (!inBounds(nx, ny) || terrain[idx(nx, ny)] === 3) continue;
        var o = grid[idx(nx, ny)];
        if (o === pl.idx) continue;
        var t = terrain[idx(nx, ny)];
        var s = (o === -1 ? 10 : 4) + (2 - t) * 2 - Math.hypot(nx - pl.capital.x, ny - pl.capital.y) * 0.05 + rnd() * 2;
        if (s > bs) { bs = s; best = { x: nx, y: ny }; }
      }
    }
    return bs > -50 ? best : null;
  }
  function freeOwnCellNear(pl, cx, cy, rad) {
    for (var r = 0; r <= rad; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var x = cx + dx, y = cy + dy;
      if (inBounds(x, y) && grid[idx(x, y)] === pl.idx && terrain[idx(x, y)] !== 3 && !aaOnCell(x, y) && !bunkerAt(x, y)) return { x: x, y: y };
    }
    return null;
  }
  // ---------- Panel de región + ficha de celda (lote 1a §3) ----------
  var TERRAIN_NAMES = ['llanura', 'tierras altas', 'montaña', 'agua'];
  function regionInfo(tx, ty) {
    if (!inBounds(tx, ty)) return null;
    var t = terrain[idx(tx, ty)], o = grid[idx(tx, ty)];
    var ownerName = o === -3 || t === 3 ? '— (agua)' :
      o === -1 ? 'neutral' :
      o >= 0 && players[o] ? (players[o].isHuman ? 'TÚ (' + C.FACTIONS[players[o].factionId].name + ')' : 'J' + (o + 1) + ' ' + C.FACTIONS[players[o].factionId].name) : '?';
    var ct = cityAt(tx, ty);
    var aa = aaOnCell(tx, ty), bk = bunkerAt(tx, ty);
    var front = null, k;
    for (k = 0; k < attacks.length; k++) {
      var a = attacks[k];
      if (a.state !== 'advance') continue;
      if ((a.cx === tx && a.cy === ty) || (a.tx === tx && a.ty === ty)) { front = a; break; }
    }
    return {
      x: tx, y: ty, terrain: TERRAIN_NAMES[t] || '?',
      owner: o, ownerName: ownerName,
      defense: t === 3 ? '—' : Math.round(defenseOfCell(tx, ty) * 10) / 10,
      city: ct ? ((ct.owner >= 0 && players[ct.owner] ? C.FACTIONS[players[ct.owner].factionId].cityName : 'Ciudad neutral')) : null,
      aa: aa ? { owner: aa.owner, hp: Math.round(aa.hp) } : null,
      bunker: bk ? { owner: bk.owner, level: bk.level, hp: Math.round(bk.hp), name: bunkerSpec(players[bk.owner]).name } : null,
      front: front ? { id: front.id, owner: front.owner, troops: Math.floor(front.troops), state: front.state } : null
    };
  }

  // ---------- Victoria ----------
  function checkVictory() {
    var total = playableCount();
    var alive = players.filter(function (p) { return p.alive; });
    for (var i = 0; i < players.length; i++) {
      if (players[i].territory / total >= C.WIN_PCT) return endGame(players[i]);
    }
    if (alive.length === 1) return endGame(alive[0]);
    if (alive.length === 0) return endGame(null);
    if (!players[0].alive) return endGame(alive[0]);
  }
  function endGame(winner) {
    if (gameOver) return;
    gameOver = { winner: winner ? winner.idx : -1 };
    stopLoop();
    var title, cls;
    if (winner && winner.idx === 0) { title = '🏆 VICTORIA — ' + C.FACTIONS[winner.factionId].name + ' domina el sector'; cls = 'win'; }
    else if (winner) { title = '☠️ DERROTA — gana J' + (winner.idx + 1) + ' (' + C.FACTIONS[winner.factionId].name + ')'; cls = 'lose'; }
    else { title = '☠️ Todos eliminados'; cls = 'lose'; }
    var total = playableCount();
    var lines = players.map(function (p) {
      return 'J' + (p.idx + 1) + ' ' + C.FACTIONS[p.factionId].name + (p.isHuman ? ' (tú)' : '') +
        ': ' + p.territory + ' (' + Math.round(p.territory / total * 100) + '%), ' +
        Math.floor(p.troops) + '/' + maxOf(p) + ' tropas, ' + p.cities + ' ciudades, ' + p.kills + ' conquistas, ' + p.fightersSent + ' cazas, ' + p.aaBuilt + ' AA';
    }).join('\n');
    showOverlay(title, lines, cls);
  }

  // ---------- Render estilo Zombie Defense ----------
  function render(now, myRun) {
    if (myRun !== runId) return; // Guardia: ignora frames de partidas viejas.
    if (!running && !gameOver) return;
    draw();
    lastTime = now;
    if (running && !gameOver) requestAnimationFrame(function (t) { render(t, myRun); });
    else draw();
  }
  function draw() {
    var V = C.VISUAL || {};
    var alpha = (typeof V.territoryAlpha === 'number') ? V.territoryAlpha : 0.55;
    if (staticLayer) ctx.drawImage(staticLayer, 0, 0);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    var x, y, o;
    // Territorios: fill de facción a alfa moderada SOBRE la textura estática.
    ctx.save();
    ctx.globalAlpha = alpha;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      o = grid[idx(x, y)];
      if (o < 0 || terrain[idx(x, y)] === 3) continue;
      ctx.fillStyle = C.FACTIONS[players[o].factionId].color;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.restore();
    // Bordes blancos luminosos entre dueños (1-2 px).
    ctx.lineWidth = V.borderWidth || 1.5;
    ctx.strokeStyle = V.borderColor || 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      o = grid[idx(x, y)];
      if (o < 0 || terrain[idx(x, y)] === 3) continue;
      var right = x + 1 < W ? grid[idx(x + 1, y)] : o;
      var down = y + 1 < H ? grid[idx(x, y + 1)] : o;
      if (terrain[idx(Math.min(x + 1, W - 1), y)] === 3) right = o;
      if (terrain[idx(x, Math.min(y + 1, H - 1))] === 3) down = o;
      if (right !== o) { ctx.moveTo((x + 1) * CELL, y * CELL); ctx.lineTo((x + 1) * CELL, (y + 1) * CELL); }
      if (down !== o) { ctx.moveTo(x * CELL, (y + 1) * CELL); ctx.lineTo((x + 1) * CELL, (y + 1) * CELL); }
    }
    ctx.stroke();
    // Ciudades.
    cities.forEach(function (c) {
      var cx = c.x * CELL + CELL / 2, cy = c.y * CELL + CELL / 2;
      ctx.fillStyle = c.owner >= 0 ? C.FACTIONS[players[c.owner].factionId].color : '#94a3b8';
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var an = Math.PI / 3 * k - Math.PI / 6;
        var px = cx + Math.cos(an) * 7, py = cy + Math.sin(an) * 7;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⬢', cx, cy + 3);
    });
    // Capitales: icono pequeño (Zombie Defense).
    players.forEach(function (pl) {
      if (!pl.alive) return;
      var capX = pl.capital.x * CELL + CELL / 2, capY = pl.capital.y * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(capX, capY, 6, 0, Math.PI * 2);
      ctx.fillStyle = C.FACTIONS[pl.factionId].color;
      ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(pl.isHuman ? '★' : '◆', capX, capY + 3);
    });
    // Ataques activos: línea + cursor pulsante.
    attacks.forEach(function (a) {
      if (a.state !== 'advance') return;
      var col = C.FACTIONS[players[a.owner].factionId].border;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.cx * CELL + CELL / 2, a.cy * CELL + CELL / 2);
      ctx.lineTo(a.tx * CELL + CELL / 2, a.ty * CELL + CELL / 2);
      ctx.stroke(); ctx.setLineDash([]);
      var pulse = 4 + Math.sin(performance.now() / 150) * 2;
      ctx.beginPath(); ctx.arc(a.cx * CELL + CELL / 2, a.cy * CELL + CELL / 2, pulse + 3, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('#' + a.id + ' ' + Math.floor(a.troops), a.cx * CELL + CELL / 2, a.cy * CELL - 4);
    });
    // AA.
    aaList.forEach(function (a) {
      var cx = a.x * CELL + CELL / 2, cy = a.y * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = a.owner === 0 ? '#22c55e' : '#ef4444';
      ctx.fill(); ctx.strokeStyle = '#052e16'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('AA', cx, cy + 3);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - 8, cy - 10, 16, 3);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(cx - 8, cy - 10, 16 * Math.max(a.hp / a.maxHp, 0), 3);
    });
    // Búnkeres: rombo con nivel + barra HP (sin shadowBlur: perf R-RES).
    bunkers.forEach(function (b) {
      var cx = b.x * CELL + CELL / 2, cy = b.y * CELL + CELL / 2, s = CELL / 2 - 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fillStyle = b.owner === 0 ? '#fb923c' : '#b45309';
      ctx.fill(); ctx.strokeStyle = '#431407'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(CELL - 1, 6) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('' + b.level, cx, cy + 3);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - 8, cy - 10, 16, 3);
      ctx.fillStyle = '#fb923c'; ctx.fillRect(cx - 8, cy - 10, 16 * Math.max(b.hp / b.maxHp, 0), 3);
    });
    if (hover.x >= 0 && inBounds(hover.x, hover.y)) {
      var hAA = aaOnCell(hover.x, hover.y);
      var hBk = bunkerAt(hover.x, hover.y);
      if (hBk) {
        var spec = bunkerSpec(players[hBk.owner]);
        ctx.beginPath(); ctx.arc(hBk.x * CELL + CELL / 2, hBk.y * CELL + CELL / 2, spec.range[hBk.level - 1] * CELL, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251,146,60,.8)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      } else if (hAA) {
        ctx.beginPath(); ctx.arc(hAA.x * CELL + CELL / 2, hAA.y * CELL + CELL / 2, hAA.range * CELL, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(74,222,128,.7)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      } else if (!gameOver) {
        ctx.strokeStyle = mode === 'attack' ? '#fff' : mode === 'fighter' ? '#fde047' : '#4ade80';
        ctx.lineWidth = 2;
        ctx.strokeRect(hover.x * CELL, hover.y * CELL, CELL, CELL);
      }
    }
    // Cazas.
    fighters.forEach(function (f) {
      var fx = f.x * CELL + CELL / 2, fy = f.y * CELL + CELL / 2;
      var col = f.owner === 0 ? '#fde047' : '#f87171';
      ctx.save(); ctx.translate(fx, fy);
      var ang = f.state === 'fly' ? Math.atan2(f.ty - f.y, f.tx - f.x) : f.age * 1.5 + Math.PI / 2;
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#000'; ctx.fillRect(fx - 9, fy - 12, 18, 3);
      var frac = Math.max(f.hp / f.maxHp, 0);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#ef4444';
      ctx.fillRect(fx - 9, fy - 12, 18 * frac, 3);
    });
  }

  function renderBoard() { if (ctx) draw(); }

  // ---------- HUD Zombie Defense ----------
  function say(t) { message = t; messageUntil = performance.now() + 3000; paintMsg(); }
  function paintMsg() { if (el.msg) el.msg.textContent = (performance.now() < messageUntil) ? message : ''; }
  setInterval(paintMsg, 300);

  function updateHUD() {
    if (!el.troops) return;
    var me = players[0];
    if (!me) return;
    var mx = maxOf(me);
    el.troops.textContent = Math.floor(me.troops) + ' / ' + mx;
    if (el.troopsB) el.troopsB.textContent = Math.floor(me.troops) + ' / ' + mx;
    el.shield.textContent = '🛡 ' + (shieldDensity(me) | 0);
    el.cities.textContent = '⬢ ' + me.cities;
    var total = playableCount();
    el.terr.textContent = me.territory + ' (' + Math.round(me.territory / total * 100) + '%)';
    el.air.textContent = fighters.filter(function (f) { return f.owner === 0; }).length + '/' + C.MAX_FIGHTERS;
    el.aa.textContent = aaList.filter(function (a) { return a.owner === 0; }).length + '/' + C.MAX_AA;
    if (el.bunk) el.bunk.textContent = bunkers.filter(function (b) { return b.owner === 0; }).length + '/' + C.MAX_BUNKERS;
    el.atk.textContent = myAttacks(0).length + '/' + BAL.frontCap(me.territory);
    // Panel de frentes propios con ID + botón retirada (lote 1a §3).
    if (el.fronts) {
      var mine = attacks.filter(function (a) { return a.owner === 0; });
      el.fronts.innerHTML = mine.length ? mine.map(function (a) {
        return '<div class="fr-row"><span>#' + a.id + ' ' + Math.floor(a.troops) + '🪖 → (' + a.tx + ',' + a.ty + ')' +
          (a.state === 'retreat' ? ' ↩' : '') + '</span>' +
          (a.state === 'advance' ? '<button data-ret="' + a.id + '">✕</button>' : '') + '</div>';
      }).join('') : '<span class="dim">sin frentes: click en frontera</span>';
    }
    // Ficha de región de la celda seleccionada.
    if (el.region) {
      if (selected.x >= 0 && inBounds(selected.x, selected.y)) {
        var ri = regionInfo(selected.x, selected.y);
        var html = '<b>(' + ri.x + ',' + ri.y + ') ' + ri.terrain + '</b><br>Dueño: ' + ri.ownerName +
          '<br>Defensa: ' + ri.defense;
        if (ri.city) html += '<br>🏙 ' + ri.city;
        if (ri.aa) html += '<br>AA (J' + (ri.aa.owner + 1) + ', HP ' + ri.aa.hp + ')';
        if (ri.bunker) html += '<br>🛖 ' + ri.bunker.name + ' Nv' + ri.bunker.level + ' (HP ' + ri.bunker.hp + ')';
        if (ri.front) html += '<br>🎯 Frente #' + ri.front.id + ' (' + Math.floor(ri.front.troops) + '🪖)';
        el.region.innerHTML = html;
      } else {
        el.region.innerHTML = '<span class="dim">click en una celda para ver su ficha</span>';
      }
    }
    if (el.ratioOut) el.ratioOut.textContent = Math.round(attackRatio * 100) + '%';
    var bF = $('btn-fighter'), bA = $('btn-aa');
    if (bF) bF.textContent = '✈️ Caza (' + fighterCost(me) + ') [2]';
    if (bA) bA.textContent = '🛡️ AA (' + aaCost(me) + ') [3]';
    // Leaderboard.
    var lb = players.slice().sort(function (a, b) { return b.territory - a.territory; });
    el.board.innerHTML = lb.map(function (p, i) {
      var pct = Math.round(p.territory / total * 100);
      return '<div class="lb-row' + (p.isHuman ? ' me' : '') + (p.alive ? '' : ' dead') + '">' +
        '<span>#' + (i + 1) + ' <i style="background:' + C.FACTIONS[p.factionId].color + '"></i>' +
        (p.isHuman ? 'TÚ ' : 'J' + (p.idx + 1) + ' ') + C.FACTIONS[p.factionId].name + '</span>' +
        '<b>' + pct + '%</b><span>' + Math.floor(p.troops) + ' 🪖 ' + p.cities + '⬢' + (p.alive ? '' : ' ☠') + '</span></div>';
    }).join('');
    var imm = immune() ? ' · 🕊 inmunidad ' + Math.ceil((C.SPAWN_IMMUNITY_TICKS - (tickCount - spawnCloseTick)) / 10) + 's' : '';
    if (el.phase) {
      if (gameOver) el.phase.textContent = 'Fin';
      else if (phase === 'spawn') el.phase.textContent = '📍 Spawn: elige punto (' + Math.ceil((C.SPAWN_PHASE_TICKS - tickCount) / 10) + 's)';
      else el.phase.textContent = 'Tique ' + tickCount + imm;
    }
    // Paridad Zombie Defense: temporizador + economía real (oro/workers/pob aún no existen → Próximamente).
    if (el.time) {
      var secs = Math.floor(tickCount * C.TICK_MS / 1000);
      var mm = Math.floor(secs / 60), ss = ('0' + (secs % 60)).slice(-2);
      el.time.textContent = mm + ':' + ss;
    }
    if (el.gold) el.gold.textContent = 'Próximamente';
    if (el.workers) el.workers.textContent = 'Próximamente';
    if (el.pop) el.pop.textContent = me.territory + ' celdas';
  }

  function showOverlay(title, stats, cls) {
    if (!el.ovTitle) return; // Headless/QA: sin DOM no hay overlay (como updateHUD).
    el.ovTitle.textContent = title; el.ovTitle.className = cls;
    el.ovStats.textContent = stats;
    el.overlay.classList.remove('hidden');
  }
  function hideOverlay() { if (el.overlay) el.overlay.classList.add('hidden'); }

  // ---------- Input ----------
  function cellFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    var sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x: Math.floor((e.clientX - r.left) * sx / CELL), y: Math.floor((e.clientY - r.top) * sy / CELL) };
  }
  function onClick(e) {
    if (!running || gameOver) return;
    var c = cellFromEvent(e);
    if (!inBounds(c.x, c.y)) return;
    selected = { x: c.x, y: c.y }; // todo click deja ficha de región
    var res;
    if (phase === 'spawn') {
      res = chooseSpawn(0, c.x, c.y);
      if (!res.ok) say('⛔ ' + res.reason); else say('📍 Punto fijado en (' + c.x + ',' + c.y + '). Click para cambiarlo.');
      updateHUD();
      return;
    }
    if (mode === 'attack') {
      res = launchAttack(0, c.x, c.y);
      if (!res.ok) say('⛔ ' + res.reason);
      else if (res.reinforced) say('➕ Refuerzo al frente #' + res.reinforced);
      else updateHUD();
    } else if (mode === 'fighter') {
      res = sendFighter(0, c.x, c.y);
      if (!res.ok) say('⛔ ' + res.reason); else { say('✈️ Caza en camino'); updateHUD(); }
    } else if (mode === 'bunker') {
      var bk = bunkerAt(c.x, c.y);
      res = (bk && bk.owner === 0) ? upgradeBunker(0, c.x, c.y) : buildBunker(0, c.x, c.y);
      if (!res.ok) say('⛔ ' + res.reason); else { say(bk ? '🛖 Búnker mejorado' : '🛖 Búnker Nv1: repele tierra en automático'); updateHUD(); }
    } else {
      res = buildAA(0, c.x, c.y);
      if (!res.ok) say('⛔ ' + res.reason); else { say('🛡️ AA desplegada (rango 5, solo-aire)'); updateHUD(); }
    }
    updateHUD();
  }
  function setMode(m) {
    mode = m;
    ['attack', 'fighter', 'aa', 'bunker'].forEach(function (k) { var b = $('btn-' + k); if (b) b.classList.toggle('active', k === m); });
    var hint = $('hint');
    if (hint) hint.textContent = m === 'attack'
      ? 'Click en frontera: ataque sostenido con % del slider. Re-click en tu frente = refuerzo. X o click dcho = retirar último.'
      : m === 'fighter' ? 'Click: caza (inmune a tierra; lo paran AA y cazas). Bombardea 12 s.'
      : m === 'bunker' ? 'Click en tu territorio: búnker anti-tierra (rango 4/5/6, 3 niveles). Click en tu búnker = mejorar.'
      : 'Click en tu territorio: AA barata rango 5, SOLO aire.';
  }

  function boot() {
    canvas = $('map'); ctx = canvas.getContext('2d');
    canvas.width = W * CELL; canvas.height = H * CELL;
    el.troops = $('hud-troops'); el.shield = $('hud-shield'); el.cities = $('hud-cities');
    el.terr = $('hud-terr'); el.air = $('hud-air'); el.aa = $('hud-aa'); el.atk = $('hud-atk');
    el.msg = $('hud-msg'); el.board = $('leaderboard'); el.phase = $('hud-phase');
    el.overlay = $('overlay'); el.ovTitle = $('ov-title'); el.ovStats = $('ov-stats');
    el.ratio = $('ratio'); el.ratioOut = $('ratio-out');
    el.time = $('hud-time'); el.gold = $('hud-gold'); el.workers = $('hud-workers'); el.pop = $('hud-pop');
    el.troopsB = $('hud-troops-b');
    el.bunk = $('hud-bunk'); el.fronts = $('fronts-list'); el.region = $('region-card');
    btnPauseEl = $('btn-pause'); pausedFlag = false;
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', function (e) { hover = cellFromEvent(e); });
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (mode === 'attack') { var r = retreatAttack(0); if (!r.ok) say('⛔ ' + r.reason); }
    });
    $('btn-attack').addEventListener('click', function () { setMode('attack'); });
    $('btn-fighter').addEventListener('click', function () { setMode('fighter'); });
    $('btn-aa').addEventListener('click', function () { setMode('aa'); });
    var bB = $('btn-bunker');
    if (bB) bB.addEventListener('click', function () { setMode('bunker'); });
    var fl = $('fronts-list'); // delegación: botón ✕ retira ese frente por ID
    if (fl) fl.addEventListener('click', function (e) {
      var id = e.target && e.target.getAttribute && e.target.getAttribute('data-ret');
      if (id) retreatAttack(0, parseInt(id, 10));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '1') setMode('attack');
      if (e.key === '2') setMode('fighter');
      if (e.key === '3') setMode('aa');
      if (e.key === '4') setMode('bunker');
      if (e.key === 'x' || e.key === 'X') retreatAttack(0);
      if (e.key === 't' || e.key === 'T') { attackRatio = Math.max(0.1, attackRatio - 0.05); el.ratio.value = attackRatio; updateHUD(); }
      if (e.key === 'y' || e.key === 'Y') { attackRatio = Math.min(1, attackRatio + 0.05); el.ratio.value = attackRatio; updateHUD(); }
    });
    el.ratio.addEventListener('input', function (e) { attackRatio = parseFloat(e.target.value); updateHUD(); });
    $('btn-start').addEventListener('click', function () {
      if (phase === 'spawn' && running) { closeSpawn(); updateHUD(); return; } // ▶ cierra spawn
      newGame(document.querySelector('input[name="faction"]:checked').value);
      setMode('attack'); updateHUD();
    });
    $('btn-restart').addEventListener('click', function () {
      newGame(document.querySelector('input[name="faction"]:checked').value);
      setMode('attack'); updateHUD();
    });
    if (btnPauseEl) btnPauseEl.addEventListener('click', function () {
      if (!pausedFlag) pauseGame();
      else resumeGame();
    });
    setMode('attack');
    newGame('terran');
    updateHUD();
  }

  function setDifficulty(d) {
    var opts = (C.DIFFICULTY && C.DIFFICULTY.options) || {};
    if (opts[d]) { difficulty = d; return { ok: true }; }
    return { ok: false, reason: 'dificultad inválida' };
  }
  function setAttackRatio(r) {
    attackRatio = Math.max(0.1, Math.min(1, r));
    return attackRatio;
  }

  window.SC_GAME = {
    boot: boot, newGame: newGame, stopLoop: stopLoop,
    pauseGame: pauseGame, resumeGame: resumeGame, // QD-001 (testeables headless)
    isPaused: function () { return pausedFlag; },
    launchAttack: launchAttack, tryGroundAttack: tryGroundAttack, retreatAttack: retreatAttack,
    sendFighter: sendFighter, buildAA: buildAA, setMode: setMode,
    chooseSpawn: chooseSpawn, closeSpawn: closeSpawn, // R-SPAWN lote 1a
    setDifficulty: setDifficulty, setAttackRatio: setAttackRatio,
    buildBunker: buildBunker, upgradeBunker: upgradeBunker, // R-BUNKER
    regionInfo: regionInfo, checkAnnex: checkAnnex, // panel + anexión
    state: function () {
      var total = terrain ? playableCount() : W * H;
      return {
        running: running, gameOver: gameOver, tick: tickCount, immune: immune(),
        phase: phase, difficulty: difficulty,
        players: players.map(function (p) {
          return { idx: p.idx, faction: p.factionId, troops: Math.floor(p.troops), max: maxOf(p), territory: p.territory, pct: Math.round(p.territory / total * 100), cities: p.cities, alive: p.alive, kills: p.kills, confirmed: !!p.confirmed };
        }),
        fighters: fighters.length, aa: aaList.length, bunkers: bunkers.length, attacks: attacks.length, cities: cities.length
      };
    },
    debug: function () { return { players: players, fighters: fighters, aaList: aaList, bunkers: bunkers, attacks: attacks, cities: cities, grid: grid, terrain: terrain, phase: phase }; },
    mapHash: mapHash,
    getSeed: function () { return simSeed; },
    setSeed: srand
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
