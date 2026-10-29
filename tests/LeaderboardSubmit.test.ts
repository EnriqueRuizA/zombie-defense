import { GameType } from "@zombie-defense/engine-api/game/GameTypes";
import { describe, expect, test } from "vitest";
import {
  buildLeaderboardRows,
  LeaderboardSubmitInput,
  LeaderboardSubmitParams,
  winnerClientIds,
} from "../src/server/LeaderboardSubmit";

const PARAMS: LeaderboardSubmitParams = {
  minDurationS: 60,
  minHumans: 1,
  scope: "all",
  maxName: 24,
};

const START = 1_760_000_000_000;
const END = START + 10 * 60 * 1000;

function input(
  overrides: Partial<LeaderboardSubmitInput> = {},
): LeaderboardSubmitInput {
  return {
    gameID: "abcdefghij",
    gameType: GameType.Public,
    statsAgreed: true,
    winner: ["player", "client-1"],
    allPlayersStats: {
      "client-1": { finalTiles: 1200n, kills: [{ victim: "v1", tick: 1n }] },
      // BigIntStringSchema accepts a numeric string on the wire and in
      // archived records; the TS type only names the bigint form.
      "client-2": {
        finalTiles: "800" as unknown as bigint,
        kills: [],
      },
    },
    players: [
      { clientID: "client-1", username: "Alice" },
      { clientID: "client-2", username: "Bob" },
    ],
    startTimeMs: START,
    endTimeMs: END,
    ...overrides,
  };
}

describe("winnerClientIds", () => {
  test("a player winner is its id", () => {
    expect(winnerClientIds(["player", "a"])).toEqual(new Set(["a"]));
  });

  test("a team winner carries a name first, then the ids", () => {
    expect(winnerClientIds(["team", "Reds", "a", "b"])).toEqual(
      new Set(["a", "b"]),
    );
  });

  test("a nation winner scores nobody human", () => {
    expect(winnerClientIds(["nation", "Aztec"])).toEqual(new Set());
  });

  test("no winner scores nobody", () => {
    expect(winnerClientIds(undefined)).toEqual(new Set());
  });
});

describe("buildLeaderboardRows", () => {
  test("one row per human with stats, winner marked", () => {
    const result = buildLeaderboardRows(input(), PARAMS);
    expect(result.reason).toBeUndefined();
    expect(result.rows).toEqual([
      {
        name: "Alice",
        score: 1200,
        kills: 1,
        won: 1,
        game_id: "abcdefghij",
        duration_s: 600,
        at: new Date(END).toISOString(),
      },
      {
        name: "Bob",
        score: 800,
        kills: 0,
        won: 0,
        game_id: "abcdefghij",
        duration_s: 600,
        at: new Date(END).toISOString(),
      },
    ]);
  });

  test("singleplayer never scores", () => {
    expect(
      buildLeaderboardRows(input({ gameType: GameType.Singleplayer }), PARAMS),
    ).toEqual({
      rows: [],
      reason: "singleplayer",
    });
  });

  test("disagreed stats never score", () => {
    expect(buildLeaderboardRows(input({ statsAgreed: false }), PARAMS)).toEqual(
      {
        rows: [],
        reason: "statsDisagreed",
      },
    );
  });

  test("games shorter than minDurationS never score", () => {
    expect(
      buildLeaderboardRows(input({ endTimeMs: START + 59_000 }), PARAMS),
    ).toEqual({ rows: [], reason: "shortGame" });
  });

  test("minHumans is counted before the scope filter", () => {
    // Only one human has stats, and scope=winners drops them anyway: the
    // gate that fires is the human count, not the empty board.
    const result = buildLeaderboardRows(
      input({
        allPlayersStats: { "client-2": { finalTiles: 800n } },
        winner: ["player", "client-2"],
      }),
      { ...PARAMS, scope: "winners", minHumans: 2 },
    );
    expect(result).toEqual({ rows: [], reason: "tooFewHumans" });
  });

  test("scope=winners keeps only the winner's row", () => {
    const result = buildLeaderboardRows(input(), {
      ...PARAMS,
      scope: "winners",
    });
    expect(result.rows.map((r) => [r.name, r.won])).toEqual([["Alice", 1]]);
  });

  test("scope=winners with no human winner scores nobody", () => {
    const result = buildLeaderboardRows(
      input({ winner: ["nation", "Aztec"] }),
      { ...PARAMS, scope: "winners" },
    );
    expect(result).toEqual({ rows: [], reason: "noRows" });
  });

  test("bots are excluded: only roster humans are looked at", () => {
    // A bot nation's stats never reach AllPlayersStats keyed by a clientID,
    // and the roster carries humans only, so a bot-heavy game still scores
    // just its humans.
    const result = buildLeaderboardRows(
      input({
        allPlayersStats: { "client-1": { finalTiles: 10n } },
        winner: ["nation", "Aztec"],
      }),
      PARAMS,
    );
    expect(result.rows.map((r) => r.name)).toEqual(["Alice"]);
  });

  test("a human without stats is not counted and not scored", () => {
    const result = buildLeaderboardRows(
      input({
        allPlayersStats: { "client-1": { finalTiles: 10n } },
        winner: ["player", "client-1"],
      }),
      PARAMS,
    );
    expect(result.rows.map((r) => r.name)).toEqual(["Alice"]);
  });

  test("kills is the length of the kill list", () => {
    const result = buildLeaderboardRows(
      input({
        allPlayersStats: {
          "client-1": {
            finalTiles: 5n,
            kills: [
              { victim: "a", tick: 1n },
              { victim: "b", tick: 2n },
            ],
          },
        },
        winner: ["player", "client-1"],
      }),
      PARAMS,
    );
    expect(result.rows[0]!.kills).toBe(2);
  });

  test("a missing finalTiles scores 0", () => {
    const result = buildLeaderboardRows(
      input({
        allPlayersStats: { "client-1": { kills: [] } },
        winner: ["player", "client-1"],
      }),
      PARAMS,
    );
    expect(result.rows[0]!.score).toBe(0);
  });

  test("duration is floored to whole seconds from the instants it is given", () => {
    const result = buildLeaderboardRows(
      input({ endTimeMs: START + 90_500 }),
      PARAMS,
    );
    expect(result.rows[0]!.duration_s).toBe(90);
  });
});
