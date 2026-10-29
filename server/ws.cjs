'use strict';
// WebSocket mínimo (solo texto): handshake + codec de frames. Sin dependencias.
var crypto = require('crypto');
var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key).trim() + GUID).digest('base64');
}

function encodeText(str, masked) {
  var payload = Buffer.from(String(str), 'utf8');
  var len = payload.length, header;
  var mask = masked ? 4 : 0;
  if (len < 126) header = Buffer.from([0x81, len | (masked ? 0x80 : 0)]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126 | (masked ? 0x80 : 0); header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127 | (masked ? 0x80 : 0); header.writeBigUInt64BE(BigInt(len), 2); }
  if (!masked) return Buffer.concat([header, payload]);
  var maskKey = crypto.randomBytes(4);
  for (var i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
  return Buffer.concat([header, maskKey, payload]);
}

function encodeClose() { return Buffer.from([0x88, 0x00]); }

// Lee frames de cliente (enmascarados) o eco local. Devuelve {frames:[str], rest:Buffer, closed:bool}.
function decodeFrames(buf) {
  var frames = [], closed = false, off = 0;
  while (off + 2 <= buf.length) {
    var b0 = buf[off], b1 = buf[off + 1];
    var op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
    var len = b1 & 0x7f, hlen = 2;
    if (len === 126) { if (off + 4 > buf.length) break; len = buf.readUInt16BE(off + 2); hlen = 4; }
    else if (len === 127) { if (off + 10 > buf.length) break; var big = buf.readBigUInt64BE(off + 2); if (big > BigInt(1 << 20)) break; len = Number(big); hlen = 10; }
    var mlen = masked ? 4 : 0;
    if (off + hlen + mlen + len > buf.length) break;
    var start = off + hlen + mlen;
    var payload = buf.slice(start, start + len);
    if (masked) { var mk = buf.slice(off + hlen, off + hlen + 4); for (var i = 0; i < payload.length; i++) payload[i] ^= mk[i % 4]; }
    if (op === 0x8) { closed = true; off = start + len; break; }
    if (op === 0x1) frames.push(payload.toString('utf8'));
    // ping/pong/opcode 0x9/0xA/continuaciones: se ignoran salvo texto.
    off = start + len;
  }
  return { frames: frames, rest: buf.slice(off), closed: closed };
}

module.exports = { GUID: GUID, acceptKey: acceptKey, encodeText: encodeText, encodeClose: encodeClose, decodeFrames: decodeFrames };
