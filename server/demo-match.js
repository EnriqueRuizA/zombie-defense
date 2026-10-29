'use strict';
// Puerta de oleada 0: 2 clientes WS contra el servidor en la misma sala.
// Uso: node server/server.js --port 8137 &  node server/demo-match.js --port 8137
// Imprime RESULT OK si ambos ven roster de 2 e intercambian inputs.
var net = require('net');
var crypto = require('crypto');
var WS = require('./ws.cjs');

function arg(name, def) {
  var i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
var PORT = parseInt(arg('--port', '8137'), 10) || 8137;
var ROOM = arg('--room', 'SC-DEMO');
var TIMEOUT = parseInt(arg('--timeout', '8000'), 10) || 8000;

function makeClient(nick, faction) {
  var c = { nick: nick, faction: faction, hs: false, head: '', buf: Buffer.alloc(0), joined: null, roster: null, inputs: [], sock: null };
  c.sock = net.connect(PORT, '127.0.0.1', function () {
    var key = crypto.randomBytes(16).toString('base64');
    c.sock.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:' + PORT + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
  c.sock.on('data', function (chunk) {
    if (!c.hs) {
      c.head += chunk.toString('latin1');
      var p = c.head.indexOf('\r\n\r\n');
      if (p < 0) return;
      if (c.head.indexOf(' 101 ') < 0) { console.log('RESULT FAIL handshake ' + nick); process.exit(1); }
      c.hs = true;
      var rest = Buffer.from(c.head.slice(p + 4), 'latin1');
      c.head = '';
      onData(c, rest);
      return;
    }
    onData(c, chunk);
  });
  c.sock.on('error', function (e) { console.log('RESULT FAIL socket ' + nick + ': ' + e.message); process.exit(1); });
  return c;
}

function onData(c, chunk) {
  c.buf = Buffer.concat([c.buf, chunk]);
  var dec = WS.decodeFrames(c.buf);
  c.buf = dec.rest;
  dec.frames.forEach(function (f) {
    var m = null;
    try { m = JSON.parse(f); } catch (e) { return; }
    if (m.t === 'joined') { c.joined = m; c.roster = m.roster; }
    else if (m.t === 'roster' || m.t === 'tick') { if (m.roster) c.roster = m.roster; }
    else if (m.t === 'input') c.inputs.push(m);
    else if (m.t === 'error') { console.log('RESULT FAIL server error for ' + c.nick + ': ' + m.reason); process.exit(1); }
  });
}

function send(c, obj) { c.sock.write(WS.encodeText(JSON.stringify(obj), true)); }
function count(roster) { return roster ? roster.filter(Boolean).length : 0; }

var A = makeClient('DemoA', 'terran');
var B = makeClient('DemoB', 'zerg');
var t0 = Date.now();
var phase = 'join';
var iv = setInterval(function () {
  if (Date.now() - t0 > TIMEOUT) { console.log('RESULT FAIL timeout en fase ' + phase); process.exit(1); }
  if (phase === 'join') {
    if (A.hs && !A.joined) send(A, { t: 'join', room: ROOM, nick: 'DemoA', faction: 'terran' });
    if (B.hs && !B.joined) send(B, { t: 'join', room: ROOM, nick: 'DemoB', faction: 'zerg' });
    if (A.joined && B.joined && count(A.roster) === 2 && count(B.roster) === 2) {
      phase = 'input';
      // Base de tick = tick vigente de la sala recibido en `joined` (si la sala
      // ya avanzó, un tick fijo 0 se rechazaría como "tardío").
      send(A, { t: 'input', tick: A.joined.tick | 0, action: { k: 'attack', x: 10, y: 10 } });
      send(B, { t: 'input', tick: B.joined.tick | 0, action: { k: 'ready' } });
    }
    return;
  }
  var slotsA = {}, slotsB = {};
  A.inputs.forEach(function (m) { slotsA[m.slot] = 1; });
  B.inputs.forEach(function (m) { slotsB[m.slot] = 1; });
  if (Object.keys(slotsA).length >= 2 && Object.keys(slotsB).length >= 2) {
    clearInterval(iv);
    console.log('RESULT OK room=' + A.joined.code + ' seed=' + A.joined.seed + ' roster=2/2 inputs=2/2');
    A.sock.destroy(); B.sock.destroy();
    process.exit(0);
  }
}, 100);
