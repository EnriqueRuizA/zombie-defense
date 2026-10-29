# Casual Mode

A local, no-accounts build of Zombie Defense: no logins, no sessions, no
Steam, no payments and no external ranking. The multiplayer relay, the
simulation and everything else about the game are unchanged — only the
identity and the meta layers around the game are gone.

The persistent version this replaces is archived on
`archive/persistence-steam-auth` (tag `pre-casual-archive`); see
[Retaking persistence](#retaking-persistence).

## Running it

```bash
npm run start:server-casual # CASUAL_MODE=1 GAME_ENV=dev GIT_COMMIT=DEV
```

Or set `CASUAL_MODE=1` on any server start. The flag is refused together with
`GAME_ENV=prod` (`ServerEnv.casualBootErrorFor`), so a casual server can never
be deployed as the real one.

## Environment

| Variable                     | Default                | Meaning                                               |
| ---------------------------- | ---------------------- | ----------------------------------------------------- |
| `CASUAL_MODE`                | unset                  | `1`/`true` turns casual mode on; anything else is off |
| `LEADERBOARD_PATH`           | `data/leaderboard.csv` | Where the board lives (relative to the repo)          |
| `LEADERBOARD_TOP_N`          | `100`                  | Rows kept on disk                                     |
| `LEADERBOARD_MAX_NAME`       | `24`                   | Longest stored name                                   |
| `SCORE_MAX`                  | `10000000`             | Score is clamped to this                              |
| `KILLS_MAX`                  | `100000`               | Kills are clamped to this                             |
| `LEADERBOARD_MIN_DURATION_S` | `60`                   | Shorter games are not counted                         |
| `LEADERBOARD_MIN_HUMANS`     | `1`                    | Minimum human players for a counted game              |
| `LEADERBOARD_SCOPE`          | `all`                  | `all` or `multiplayer` — which games count            |
| `LEADERBOARD_MAX_LIMIT`      | `1000`                 | Cap on the `?limit=` the route accepts                |

Invalid values throw at boot rather than silently falling back.

## What the page carries

A casual page is rendered with `casualMode: true` in
`window.BOOTSTRAP_CONFIG` and **no** `turnstileSiteKey`, and it ships no
Turnstile script at all. `ClientEnv.casualMode()` reads the flag; the field's
TypeScript shape in `packages/shared` is deliberately untouched (D8).

## Identity: the persistent id

There is no account. The client keeps one UUID in `localStorage`
(`player_persistent_id`, see `Auth.getPersistentID`) and sends it as the
WebSocket join token; the server accepts a bare UUID in casual mode
(`jwt.verifyClientToken`) and derives the client id from it. `userAuth()`
always answers "not logged in", `getPlayToken()` answers the UUID, and
`logOut()` is a no-op that keeps it.

The nav account control renders nothing (`NavAccountMenu`), so there is
nothing to sign in to and no account surface behind it.

## The leaderboard

The only ranking is a CSV the game server owns:

```
name,score,kills,won,game_id,duration_s,at
```

- **Write path**: only the Master writes. When a game archives, the worker
  builds candidate rows (`LeaderboardSubmit`), sends them over IPC
  (`leaderboardSubmit`), and Master sanitises and appends them
  (`LeaderboardStore`). A store that fails to open disables itself with a
  warning and every submit is skipped and logged.
- **Gates** (in order): `singleplayer`, `statsDisagreed`, `shortGame`,
  `tooFewHumans`, `scope`, `noRows`, `noWinner`. A game with no stats
  agreement contributes nothing — never zeroes.
- **Read path**: `GET /api/leaderboard?limit=N` answers
  `{ generatedAt, entries: [{ rank, name, score, kills, won, at }] }` with
  `Cache-Control: no-store`, rate-limited to 30/min per IP. The client's
  leaderboard modal renders it (`LocalLeaderboard`) instead of the ranked
  ladders, clans and tribes tabs.

A corrupt file keeps its valid rows and drops the invalid ones with a warning;
it never loses the board over one bad line.

## Not in this mode

Accounts, sessions and JWTs; Discord/Google/Steam login; Turnstile; Stripe and
the subscription; clans; the external ranked ladders, player profiles and
stats API; the winner-replay check-in loops and the privilege refresher.

## Retaking persistence

`main` is the casual build. The pre-casual tree is at
`archive/persistence-steam-auth` (tag `pre-casual-archive`); to bring a
feature back, diff the two rather than merging:

```bash
git diff main...archive/persistence-steam-auth -- src/client/Auth.ts
```

Reapply the change on `main` behind the same casual gates this doc describes,
so a casual build stays account-free.
