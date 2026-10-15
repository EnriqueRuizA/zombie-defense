# Protocolo de red v0 (oleada 0) — JSON sobre WebSocket

Base: `ws://HOST:8137` (por defecto). Sin auth. Salas de 4 por código (`SC-123`).

## Cliente → servidor

| `t` | Campos | Respuesta |
|---|---|---|
| `ping` | — | `pong {tick}` |
| `join` | `room` (código o vacío=crear), `nick` (1–16), `faction` (`terran\|zerg\|protoss`) | `joined {code, slot, seed, tick, roster}` o `error {reason}` |
| `input` | `tick` (int), `action` (ver abajo) | difusión `input {slot, tick, action, n}` o `error` |
| `leave` | — | `left` + difusión `roster` |

Acciones (`action.k`): `attack {x,y}`, `fighter {x,y}`, `aa {x,y}`, `retreat`, `ready`.
Coords enteras en rango del mapa (80×50). Ticks tardíos (`tick < serverTick-2`) se rechazan.

## Servidor → cliente

| `t` | Campos |
|---|---|
| `joined` | `code, slot, seed, tick, roster` (`seed` = semilla de la sim: todos generan el mismo mapa; `tick` = reloj de sala vigente, úsalo como base de `input.tick` al entrar) |
| `roster` | `roster [{slot, nick, faction, alive} \| null ×4]` |
| `input` | `slot, tick, action, n` (n = nº en el log; orden total por llegada) |
| `tick` | `tick, roster` (cada 10 ticks de servidor = 1 s) |
| `left` | — |
| `pong` | `tick` |
| `error` | `reason` (humano-legible, se muestra en HUD en oleada 1) |

## HTTP (debug)

- `GET /` → `{ok, service, version, rooms}`
- `GET /rooms` → `{rooms: [{code, tick, players, logLen}]}`

## Reglas v0 (honestas)

- El servidor **ordena y retransmite** inputs y guarda el log (cap 5000); **no re-simula** todavía.
  La sim autoritativa completa llega en oleada 1 con el determinismo total.
- Desconexión = `leave` implícito y difusión de `roster`. Se detecta al instante
  con frame `close`, con FIN del peer (evento `end`) o con `leave`; sin eso el
  slot se liberaría tarde (el servidor no re-simula, solo retransmite).
- Sala vacía 60 s se elimina.

## Puerta de oleada 0

`node server/demo-match.js` levanta 2 clientes contra el servidor, ambos `join` a la misma
sala, intercambian 1 `input` cada uno y exigen `roster` de 2 en ambos lados → imprime `RESULT OK`.
