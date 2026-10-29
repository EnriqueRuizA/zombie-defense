# Local-Only Mode

Status: approved for implementation (cycle spec). Source of truth: the user
decisions below plus `docs/CasualMode.md` as historical context.

## User goal

Run Zombie Defense on one machine, with no accounts and no external services:

1. Play Solo and Tutorial.
2. Create a lobby.
3. See every open lobby created on the same local server (all workers) and join it.
4. Join by local ID/link as an alternative.
5. Play the match.

No public discovery, ranked/matchmaking, leaderboard, clans, friends, presence,
invites, spectating, replays, store, cosmetics, inventory, XP/levels, persistent
stats/profiles, system notifications, ads, news, featured streams, multi-server,
CDN or desktop update checks.

## User decisions (verbatim intent)

- "no quiero ver partidas de otros, ni ranking, solo quiero poder crear lobby y
  unirme a un lobby creado en el mismo server."
- "si quiero que se muestren si están en el mismo server."
- "solo el localhost, no se deben mandar handshakes ni nada parecido fuera."
- Remove accounts/login, store, cosmetics, inventory, XP/levels, stats/profiles,
  notifications and ads: "si elimina todo eso."
- Remove replays and spectating: "1 si."
- Always local-only, not only with `CASUAL_MODE=1`: "siempre."

## Scope

In scope: master, workers, lobby WebSocket, game WebSocket, web client, home,
create/join lobby, waiting room, match, end-of-match summary, local identity,
local settings/language/help, local asset serving, tests and docs.

Out of scope: internet multiplayer, NAT/tunnels, public deployment, accounts,
OAuth/JWT/Turnstile/Stripe/Steam, rankings/ELO/matchmaking, clans/friends/
presence/invites, spectating, public replays, game archive, CDN, telemetry,
ads/news/featured streams, desktop/Electron shell, engine determinism/balance
changes.

## Rules

| ID | Rule |
|---|---|
| R1 | Local-only is the only mode. `CASUAL_MODE` is not read and cannot alter behavior. |
| R2 | No outbound HTTP/WS at runtime. Every request goes to `127.0.0.1`, `localhost` or `::1`. |
| R3 | Master, workers and Vite listen on `127.0.0.1`, never `0.0.0.0` or `::`. |
| R4 | `index.html` loads no external scripts, styles, fonts, images, iframes or SDKs. `CDN_BASE` is empty; assets are same-origin. |
| R5 | No account/login. Local UUID in `localStorage` plus a local nick; the server accepts the UUID as the client token, no JWT. |
| R6 | No store, cosmetics, inventory, currency, XP, levels, badges, persistent stats/profiles, system notifications or ads. |
| R7 | Every player-created lobby on the local server is visible and joinable while it is in lobby phase and has a slot. No user-facing public/private/listed/featured/scheduled distinction. |
| R8 | The master aggregates lobbies from all workers and broadcasts one deterministic list to every local client. |
| R9 | No automatic lobbies. Remove scheduler, `MapPlaylist`, map weights, auto-start, paid queue and automatic game creation. |
| R10 | No spectating or replay UI/route. A late join is rejected. Server winner replay is removed; an engine helper may remain only if a test/compile needs it, never exposed. |
| R11 | No game persistence. No leaderboard CSV, archive/replay files or stats. Only local identity/nick/language/audio/video/control/tutorial keys. |
| R12 | Home only offers Solo, Tutorial, Create, Join, local lobby list, settings, language and local help. |
| R13 | Join by ID/link always resolves on the current local origin. Missing/full/started returns a local error; never redirects to another host. |
| R14 | Preserve Solo/Tutorial, bots, maps, game config, WebGL2, local audio and engine determinism. |
| R15 | No multi-server. Remove server list, cluster map, instance letters, check-in, lobby coordinator and cross-host redirects. IDs are local and opaque. |
| R16 | Update/delete obsolete tests with justification; do not weaken tests to pass. Replace `docs/CasualMode.md` with local-only docs. |
| R17 | Preserve the existing dirty tree. No `git reset`, `git clean`, revert, commit or push. |

## Lobby behavior (implementation bridge)

The wire may keep the existing `PublicGames`/`PublicGameInfo` transport during
the first wave to avoid a simultaneous client/server rewrite. Behavior is what
matters:

- The worker reports every game in lobby phase, not just public/listed games.
- The master publishes all of them, across workers, ordered by `createdAt` then
  `gameID`.
- The server sets neutral values for legacy fields (`publicGameType: "hosted"`,
  no `featured`, `label`, `accent`, `queued`, `creatorID`, `queuedAt`,
  `autoStartAt`, scheduling or caps).
- The client removes filters/labels/trust/featured/queue UI and renders every
  received lobby as a plain local lobby.
- The `LocalLobby*` rename is a later cleanup, not an acceptance criterion.
- A lobby disappears when it starts, fills or its host leaves. Late joins are
  rejected; no spectator path.
- The master no longer creates lobbies. Only player-created lobbies exist.

## Identity

- `getPersistentID()` reads `player_persistent_id`; if absent, create a UUID v4
  and store it. If `localStorage` is unavailable, use an in-memory UUID.
- Nick is local and editable. Keep current sanitization/length rules. Duplicate
  nicks are allowed; the UUID distinguishes players.
- Join sends `clientToken = UUID`; the server validates the UUID format and
  derives the client id. No signature, issuer, audience, expiry or Turnstile.
- No Authorization header, refresh, logout, session, trust, clan tag, level or
  badge. Local storage keys are limited to identity, nick, language, settings
  and tutorial seen.

## Flows

Create: player chooses map/config (no listing/queue/auto-start/whitelist/
cosmetics), worker creates the game, master publishes it within 1 s, host starts
when ready.

List/join: any local tab connects to `/lobbies`, receives the aggregated
snapshot, joins the owning worker. Full/started returns a local error and
refreshes the list. No spectator.

Start: host starts; the lobby leaves the list for all tabs; late joins rejected.

Leave/disconnect: host leaving closes the lobby; a player leaving updates the
count; reconnect to an ongoing match is allowed only for players already in it.

Solo/Tutorial: no account, no server round-trip, no external assets.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC1 | A clean profile loads the home with no request to a host other than `127.0.0.1`/`localhost`/`::1`. |
| AC2 | `Get-NetTCPConnection -State Listen` shows master, workers and Vite only on loopback, never `0.0.0.0`/`::`. |
| AC3 | With the machine offline, `npm run build-prod`, `npm run start:server`, `npm run start:client` and Solo work. |
| AC4 | A new profile gets a UUID and nick; reload preserves them; no login/logout/account/avatar. |
| AC5 | Tab A creates a lobby; tabs B and C see it within 1 s and can join; counts are correct. |
| AC6 | On start, the lobby disappears from every tab; a late join is rejected; no spectator. |
| AC7 | Lobbies created on different workers appear in one list and are joinable; no creator dedupe or listing cap. |
| AC8 | Home only offers Solo, Tutorial, Create, Join, local list, settings, language and local help. |
| AC9 | No UI/route for ranked, matchmaking, store, cosmetics, inventory, clans, friends, leaderboard, news, ads, replays or spectating. |
| AC10 | `CASUAL_MODE` is not in the startup flow; local-only is unconditional. |
| AC11 | No `data/leaderboard.csv`, archive/replay files or stats; restarting loses lobbies and results. |
| AC12 | `index.html` and the bundle contain no external script/link/font/image; `CDN_BASE` is empty. |
| AC13 | A valid local ID/link opens the lobby; invalid/full/started returns a local error and never redirects. |
| AC14 | `npm test`, `npm run typecheck`, `npm run lint` and `npm run build-prod` pass; removed tests are justified. |
| AC15 | Solo/Tutorial, bots, maps, config, WebGL2, local audio and engine determinism still work. |

## Verification

- Manual: two tabs + a clean profile; DevTools Network with "Preserve log" and a
  negative filter for loopback; `Get-NetTCPConnection -State Listen`; inspect
  `localStorage`; test with the network disabled.
- Automated: unit tests for local origin/URL builders, lobby aggregation/removal,
  join rejects, UUID identity, and no external URL constants in runtime code.
- QA must label each criterion `VALIDADO`, `FALLIDO`, `NO VALIDADO` or
  `NO EJECUTABLE` with evidence.

## Decisions / assumptions

- Remove the server winner-replay subprocess and call. The engine
  `replayWinner` helper may stay only if a test/compile needs it; never exposed.
- Remove the admin bot API.
- Duplicate nicks are allowed.
- Keep the end-of-match summary (score/kills/win) as local/ephemeral output; no
  persistent stats/profile.
- Keep gameplay alerts; remove account/social/system notifications.
- Keep `NUM_WORKERS` and the local Node cluster to prove cross-worker lobby
  aggregation. Default `2` in dev.
- Target is a browser on localhost; remove Electron/Steam/portal shells and
  desktop update checks.
- Build/install may use npm; runtime may not use the network.
- `CustomTribes` may stay only if it works fully offline; remove any external
  fetch.
- The `LocalLobby*` rename is deferred; the behavior rules above are binding.

## Implementation waves

0. Freeze this spec, inventory, acceptance tests and file ownership.
1. Server: loopback bind, no external network, UUID identity, remove meta
   server features, publish all local lobbies through the existing transport.
   Client: remove meta surfaces/accounts/store/cosmetics/clans/friends/
   matchmaking/leaderboard/replays/spectate/desktop/Turnstile/server list/
   telemetry/ads/news; keep Solo/Tutorial/Create/Join and the existing lobby
   feed; remove legacy filters/labels.
2. Server/client: finish local lobby lifecycle, join by ID, counts, cross-worker
   behavior, remove remaining public/listed/featured/scheduler code.
3. Cleanup: local assets/build, docs, dead code, tests, typecheck/lint.
4. QA: AC1-AC15, network audit, two-tab/cross-worker, build offline.
5. Corrections and final report.

## File ownership (no overlap)

Developer A (`developer-muse`): `src/server/**`, `packages/shared/**`,
`packages/engine*/**` only if a test/compile requires it, `index.html`,
`vite.config.ts`, `package.json`, `scripts/**`, `resources/**` except
`resources/lang/**`, `docs/**`, `CLAUDE.md`, `tests/server/**`, `tests/util/**`,
root tests for server/network/local mode.

Developer B (`developer-mimo`): `src/client/**`, `resources/lang/en.json`,
`tests/client/**`.

Neither developer edits the other's files, runs `git reset`/`clean`, commits or
pushes. Root tests outside `tests/client` belong to A; B reports needed changes
instead of editing them.
