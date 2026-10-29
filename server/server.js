'use strict';
// Servidor oleada 0: salas por código (4 jugadores), join/leave, relay de inputs
// ordenados por tick + snapshots a 10 Hz. Sin dependencias: `node server/server.js [--port 8137]`.
// Modelo v0 = retransmisor autoritativo de sala (la sim autoritativa total llega en oleada 1).
var http = require('http');
var ROOM = require('./room.cjs');
var WS = require('./ws.cjs');

var PORT = 8137;
for (var ai = 2; ai < process.argv.length; ai++) {
  if (process.argv[ai] === '--port') PORT = parseInt(process.argv[ai + 1], 10) || PORT;
}

var rooms = {}; // code -> room
var clients = new Set();

function getRoom(code) {
  code = String(code ?? '').toUpperCase().slice(0, 8);
  if (code.length === 0) code = 'SC-' + ((Math.random() * 900 + 100) | 0);
  rooms[code] ??= ROOM.createRoom(code, (Math.random() * 1e9) | 0);
  return rooms[code];
}

function send(sock, obj) {
  try { sock.write(WS.encodeText(JSON.stringify(obj))); } catch (e) { /* socket muerto */ }
}

function broadcast(room, obj, except) {
  clients.forEach(function (c) {
    if (c.room === room && c !== except) send(c.sock, obj);
  });
}

function handleMsg(c, msg) {
  if (!msg || typeof msg.t !== 'string') return send(c.sock, { t: 'error', reason: 'mensaje sin tipo' });
  if (msg.t === 'ping') return send(c.sock, { t: 'pong', tick: c.room ? c.room.tick : 0 });
  if (msg.t === 'join') {
    if (c.room) return send(c.sock, { t: 'error', reason: 'ya en sala' });
    var room = getRoom(msg.room);
    var r = ROOM.joinRoom(room, msg.nick, msg.faction);
    if (!r.ok) return send(c.sock, { t: 'error', reason: r.reason });
    c.room = room; c.slot = r.slot;
    // tick vigente: el cliente lo usa como base de input.tick (si no, la sala
    // avanzada rechaza sus inputs con "tick tardío" — ver protocol.md).
    send(c.sock, { t: 'joined', code: room.code, slot: r.slot, seed: room.seed, tick: room.tick, roster: ROOM.roster(room) });
    broadcast(room, { t: 'roster', roster: ROOM.roster(room) }, c);
    return;
  }
  if (!c.room) return send(c.sock, { t: 'error', reason: 'sin sala: join primero' });
  if (msg.t === 'leave') {
    ROOM.leaveRoom(c.room, c.slot);
    broadcast(c.room, { t: 'roster', roster: ROOM.roster(c.room) });
    c.room = null; c.slot = -1;
    return send(c.sock, { t: 'left' });
  }
  if (msg.t === 'input') {
    var res = ROOM.applyInput(c.room, c.slot, msg.tick | 0, msg.action);
    if (!res.ok) return send(c.sock, { t: 'error', reason: res.reason });
    broadcast(c.room, { t: 'input', slot: c.slot, tick: msg.tick | 0, action: msg.action, n: res.n });
    return;
  }
  return send(c.sock, { t: 'error', reason: 'tipo desconocido' });
}

var server = http.createServer(function (req, res) {
  if (req.url === '/rooms') {
    var list = Object.keys(rooms).map(function (k) {
      var s = ROOM.snapshot(rooms[k]);
      return { code: s.code, tick: s.tick, players: s.slots.filter(Boolean).length, logLen: s.logLen };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: list }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'openfront-sc oleada 0', version: 0, rooms: Object.keys(rooms).length }));
});

server.on('upgrade', function (req, sock) {
  var key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + WS.acceptKey(key) + '\r\n\r\n');
  var c = { sock: sock, room: null, slot: -1, buf: Buffer.alloc(0) };
  clients.add(c);
  sock.on('data', function (chunk) {
    c.buf = Buffer.concat([c.buf, chunk]);
    var dec = WS.decodeFrames(c.buf);
    c.buf = dec.rest;
    if (dec.closed) { closeClient(c); return; }
    dec.frames.forEach(function (f) {
      var msg = null;
      try { msg = JSON.parse(f); } catch (e) { send(sock, { t: 'error', reason: 'JSON inválido' }); return; }
      handleMsg(c, msg);
    });
  });
  sock.on('close', function () { closeClient(c); });
  // allowHalfOpen=true en http.Server: el FIN del peer emite 'end' y NO 'close'.
  // Sin este handler la sala retiene el slot (nick ocupado) hasta que falle una
  // escritura posterior (~2 s) o indefinidamente si nadie escribe.
  sock.on('end', function () { closeClient(c); });
  sock.on('error', function () { closeClient(c); });
});

function closeClient(c) {
  // Idempotente: 'end' + 'close' pueden llegar para la misma conexión.
  var room = c.room, slot = c.slot;
  c.room = null; c.slot = -1;
  if (room && slot >= 0) {
    ROOM.leaveRoom(room, slot);
    broadcast(room, { t: 'roster', roster: ROOM.roster(room) });
  }
  clients.delete(c);
  try { c.sock.destroy(); } catch (e) { /* noop */ }
}

// Tick de sala a 10 Hz: avanza reloj y difunde snapshot ligero cada segundo.
setInterval(function () {
  Object.keys(rooms).forEach(function (k) {
    var room = rooms[k];
    room.tick++;
    if (room.tick % 10 === 0) broadcast(room, { t: 'tick', tick: room.tick, roster: ROOM.roster(room) });
    // Limpieza: sala vacía 60 s.
    var n = ROOM.roster(room).filter(Boolean).length;
    if (n === 0) { room.emptyTicks = (room.emptyTicks ?? 0) + 1; if (room.emptyTicks > 600) delete rooms[k]; }
    else room.emptyTicks = 0;
  });
}, 100);

server.listen(PORT, function () {
  console.log('openfront-sc oleada 0 en puerto ' + PORT);
});
