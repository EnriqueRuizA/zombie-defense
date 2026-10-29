import {
  AllPlayersStats,
  GameID,
  Winner,
} from "@zombie-defense/engine-api/Schemas";
import { GameType } from "@zombie-defense/engine-api/game/GameTypes";
import { LeaderboardRow, LeaderboardScope } from "./LeaderboardStore";

// Turns the settled end-of-game record into leaderboard rows, or explains why
// it must not score (R12). Pure: no fs, no IPC, no clock — the caller passes
// the start/end instants it already has, so the gate is reproducible in tests.
//
// Runs in the WORKER process (GameServer hands it the winner vote's outcome),
// but the Master re-sanitizes every row it receives before it touches disk
// (R24), so nothing here is trusted on arrival.

export interface LeaderboardSubmitInput {
  gameID: GameID;
  // Singleplayer never scores (D5/C): its result is decided by the client.
  gameType: GameType;
  // Only a winner and stats confirmed by consensus — two agreeing IPs or the
  // server's own replay — may reach the board (D3/R12).
  statsAgreed: boolean;
  winner: Winner | undefined;
  allPlayersStats: AllPlayersStats;
  // The game's HUMAN players, in roster order. Bots carry no clientID and no
  // roster entry, so intersecting with this list is what excludes them (A).
  players: readonly { clientID: string; username: string }[];
  startTimeMs: number;
  endTimeMs: number;
}

export interface LeaderboardSubmitParams {
  minDurationS: number;
  minHumans: number;
  scope: LeaderboardScope;
  maxName: number;
}

export interface LeaderboardSubmitResult {
  rows: LeaderboardRow[];
  // Set when the game was gated out (or produced nothing), for the caller's
  // `leaderboardSkipped` log line (R12).
  reason?: string;
}

/**
 * Client ids belonging to the agreed winner. `["player", id]` names one
 * player, `["team", name, ...ids]` the eligible members, `["nation", name]`
 * (a bot nation winning) nobody human — so it scores nobody as a winner.
 */
export function winnerClientIds(winner: Winner | undefined): Set<string> {
  const ids = new Set<string>();
  if (winner === undefined || winner.length === 0) return ids;
  const kind = winner[0];
  const rest = winner.slice(1) as string[];
  if (kind === "player") {
    for (const id of rest) ids.add(id);
  } else if (kind === "team") {
    // rest[0] is the team NAME; the ids follow it.
    for (const id of rest.slice(1)) ids.add(id);
  }
  return ids;
}

function toScore(value: unknown): number {
  if (typeof value === "bigint") return value <= 0n ? 0 : Number(value);
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

export function buildLeaderboardRows(
  input: LeaderboardSubmitInput,
  params: LeaderboardSubmitParams,
): LeaderboardSubmitResult {
  if (input.gameType === GameType.Singleplayer) {
    return { rows: [], reason: "singleplayer" };
  }
  if (!input.statsAgreed) {
    return { rows: [], reason: "statsDisagreed" };
  }
  const durationMs = input.endTimeMs - input.startTimeMs;
  const durationS = Number.isFinite(durationMs)
    ? Math.max(0, Math.trunc(durationMs / 1000))
    : 0;
  if (durationS < params.minDurationS) {
    return { rows: [], reason: "shortGame" };
  }

  const winners = winnerClientIds(input.winner);
  const at = new Date(input.endTimeMs).toISOString();

  // Humans with stats are counted BEFORE the scope filter: minHumans is about
  // who played, not about how many of them survive `winners` scope.
  const scored = input.players.filter(
    (player) => input.allPlayersStats[player.clientID] !== undefined,
  );
  if (scored.length < params.minHumans) {
    return { rows: [], reason: "tooFewHumans" };
  }

  const rows: LeaderboardRow[] = [];
  for (const player of scored) {
    const stats = input.allPlayersStats[player.clientID]!;
    const won: 0 | 1 = winners.has(player.clientID) ? 1 : 0;
    if (params.scope === "winners" && won === 0) continue;
    rows.push({
      name: player.username,
      score: toScore(stats.finalTiles),
      kills: Array.isArray(stats.kills) ? stats.kills.length : 0,
      won,
      game_id: input.gameID,
      duration_s: durationS,
      at,
    });
  }

  if (rows.length === 0) {
    return { rows: [], reason: "noRows" };
  }
  return { rows };
}
