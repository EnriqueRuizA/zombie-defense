import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  LEADERBOARD_COLUMNS,
  LeaderboardLimits,
  LeaderboardRow,
  LeaderboardStore,
  normalizeName,
  parseLeaderboard,
  sanitizeLeaderboardRow,
  serializeLeaderboard,
  serializeLeaderboardRow,
  sortAndTrim,
} from "../src/server/LeaderboardStore";

const LIMITS: LeaderboardLimits = {
  topN: 100,
  maxName: 24,
  scoreMax: 10_000_000,
  killsMax: 100_000,
};

function row(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    name: "Alice",
    score: 1200,
    kills: 3,
    won: 1,
    game_id: "abcdefghij",
    duration_s: 600,
    at: "2026-10-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("sanitizeLeaderboardRow", () => {
  test("keeps a well-formed row as-is", () => {
    const result = sanitizeLeaderboardRow(row(), LIMITS);
    expect(result).toEqual({ ok: true, row: row() });
  });

  test("strips CSV metacharacters, control characters and extra spaces", () => {
    const result = sanitizeLeaderboardRow(
      row({ name: '  Al\u0000ice,"the"\t  hacker \n ' }),
      LIMITS,
    );
    expect(result).toEqual({
      ok: true,
      row: row({ name: "Al ice the hacker" }),
    });
  });

  test("truncates to maxName and re-trims the cut", () => {
    const result = sanitizeLeaderboardRow(
      row({ name: `${"x".repeat(23)} tail` }),
      LIMITS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.name).toBe("x".repeat(23));

    const cut = sanitizeLeaderboardRow(row({ name: "x".repeat(30) }), LIMITS);
    expect(cut.ok).toBe(true);
    if (cut.ok) expect(cut.row.name).toBe("x".repeat(24));
  });

  test("discards a row whose name is empty after sanitizing", () => {
    const result = sanitizeLeaderboardRow(row({ name: ' ,\u0001 "' }), LIMITS);
    expect(result).toEqual({
      ok: false,
      reason: "name empty after sanitization",
    });
  });

  test("clamps score and kills into range instead of discarding", () => {
    const result = sanitizeLeaderboardRow(
      row({ score: 99_999_999, kills: 1e9 }),
      LIMITS,
    );
    expect(result).toEqual({
      ok: true,
      row: row({ score: LIMITS.scoreMax, kills: LIMITS.killsMax }),
    });
  });

  test("clamps a negative score to zero", () => {
    const result = sanitizeLeaderboardRow(row({ score: -5 }), LIMITS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.score).toBe(0);
  });

  test.each(["12", "NaN", null, {}])("discards score %j", (score) => {
    const result = sanitizeLeaderboardRow(
      row({ score: score as number }),
      LIMITS,
    );
    expect(result.ok).toBe(false);
  });

  test("discards a won that is not 0 or 1", () => {
    expect(sanitizeLeaderboardRow(row({ won: 2 as 0 | 1 }), LIMITS).ok).toBe(
      false,
    );
    expect(
      sanitizeLeaderboardRow(row({ won: "1" as unknown as 0 | 1 }), LIMITS).ok,
    ).toBe(false);
  });

  test("discards a game_id that is not a game id", () => {
    expect(sanitizeLeaderboardRow(row({ game_id: "nope" }), LIMITS).ok).toBe(
      false,
    );
  });

  test("discards an at that is not ISO-8601 UTC", () => {
    expect(sanitizeLeaderboardRow(row({ at: "17/10/2026" }), LIMITS).ok).toBe(
      false,
    );
    expect(
      sanitizeLeaderboardRow(row({ at: "2026-10-17T12:00:00+02:00" }), LIMITS)
        .ok,
    ).toBe(false);
  });

  test("discards a row that is not an object", () => {
    expect(sanitizeLeaderboardRow(null, LIMITS).ok).toBe(false);
    expect(sanitizeLeaderboardRow([row()], LIMITS).ok).toBe(false);
    expect(sanitizeLeaderboardRow("name,score", LIMITS).ok).toBe(false);
  });
});

describe("normalizeName", () => {
  test("returns null for a name that sanitizes to nothing", () => {
    expect(normalizeName("   ", 24)).toBeNull();
    expect(normalizeName("\u0000\u0001", 24)).toBeNull();
  });

  test("returns the cleaned name otherwise", () => {
    expect(normalizeName("  Bob  ", 24)).toBe("Bob");
  });
});

describe("serializeLeaderboard", () => {
  test("writes the documented column order, without quoting, with one newline", () => {
    const text = serializeLeaderboard([row()]);
    expect(text).toBe(
      `${LEADERBOARD_COLUMNS.join(",")}\nAlice,1200,3,1,abcdefghij,600,2026-10-17T12:00:00.000Z\n`,
    );
  });

  test("round-trips through parseLeaderboard", () => {
    const rows = [row(), row({ name: "Bob", won: 0, score: 42 })];
    const parsed = parseLeaderboard(serializeLeaderboard(rows), LIMITS);
    expect(parsed).toEqual({ rows, skipped: 0 });
  });
});

describe("parseLeaderboard", () => {
  test("skips corrupt lines and counts them", () => {
    const text = [
      LEADERBOARD_COLUMNS.join(","),
      "Alice,1200,3,1,abcdefghij,600,2026-10-17T12:00:00.000Z",
      "not,enough,fields",
      "Bob,1200,3,1,abcdefghij,600,not-a-date",
      "",
    ].join("\n");
    const parsed = parseLeaderboard(text, LIMITS);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.name).toBe("Alice");
    expect(parsed.skipped).toBe(2);
  });

  test("discards a line with an extra trailing field", () => {
    const text =
      "Alice,1200,3,1,abcdefghij,600,2026-10-17T12:00:00.000Z,extra\n";
    expect(parseLeaderboard(text, LIMITS).skipped).toBe(1);
  });
});

describe("sortAndTrim", () => {
  const older = "2026-10-01T00:00:00.000Z";
  const newer = "2026-10-02T00:00:00.000Z";

  test("orders by score, then kills, then oldest, then name", () => {
    const rows = [
      row({ name: "tie-b", score: 10, at: newer }),
      row({ name: "tie-a", score: 10, at: newer }),
      row({ name: "old", score: 10, at: older }),
      row({ name: "kills", score: 10, kills: 9, at: newer }),
      row({ name: "high", score: 100 }),
    ];
    const sorted = sortAndTrim(rows, LIMITS.topN).map((r) => r.name);
    expect(sorted).toEqual(["high", "kills", "old", "tie-a", "tie-b"]);
  });

  test("trims to topN", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ name: `p${i}`, score: i }),
    );
    expect(sortAndTrim(rows, 3).map((r) => r.name)).toEqual(["p4", "p3", "p2"]);
  });
});

describe("LeaderboardStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "leaderboard-"));
    file = path.join(dir, "leaderboard.csv");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function store(overrides: Partial<typeof LIMITS> = {}) {
    return new LeaderboardStore({
      path: file,
      limits: { ...LIMITS, ...overrides },
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
  }

  test("starts empty when the file is absent", async () => {
    const s = store();
    await s.load();
    expect(s.entries()).toEqual([]);
    expect(s.disabled).toBe(false);
  });

  test("loads a valid file and ranks it", async () => {
    await fs.writeFile(
      file,
      serializeLeaderboard([
        row({ name: "Low", score: 5 }),
        row({ name: "High", score: 50 }),
      ]),
      "utf-8",
    );
    const s = store();
    await s.load();
    expect(s.entries().map((e) => [e.rank, e.name])).toEqual([
      [1, "High"],
      [2, "Low"],
    ]);
  });

  test("loads a BOM-prefixed file without losing the header check", async () => {
    await fs.writeFile(
      file,
      "\ufeff" + serializeLeaderboard([row({ name: "Alice" })]),
      "utf-8",
    );
    const s = store();
    await s.load();
    expect(s.entries()).toHaveLength(1);
  });

  test("keeps the valid rows of a corrupt file and warns", async () => {
    const warn = vi.fn();
    await fs.writeFile(
      file,
      [
        LEADERBOARD_COLUMNS.join(","),
        "Alice,1200,3,1,abcdefghij,600,2026-10-17T12:00:00.000Z",
        "garbage line",
      ].join("\n"),
      "utf-8",
    );
    const s = new LeaderboardStore({
      path: file,
      limits: LIMITS,
      log: { info: () => {}, warn, error: () => {} },
    });
    await s.load();
    expect(s.entries()).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      "discarded invalid leaderboard rows on load",
      expect.objectContaining({ skipped: 1, kept: 1 }),
    );
  });

  test("submit re-validates, sorts, trims and rewrites atomically", async () => {
    const s = store({ topN: 3 });
    await s.load();
    const outcome = await s.submit([
      row({ name: "A", score: 10 }),
      row({ name: "B", score: 30 }),
      // Defense in depth (R24): a row the worker built is still sanitized.
      row({ name: "C", score: 20, game_id: "not-an-id" }),
      row({ name: "D", score: 20 }),
    ]);
    expect(outcome).toEqual({ written: 3, skipped: 1 });
    expect(s.entries().map((e) => e.name)).toEqual(["B", "D", "A"]);

    const text = await fs.readFile(file, "utf-8");
    expect(text.split("\n")[0]).toBe(LEADERBOARD_COLUMNS.join(","));
    // Atomic write: no tmp file left behind.
    expect((await fs.readdir(dir)).sort()).toEqual(["leaderboard.csv"]);

    // A second load from disk agrees with memory.
    const reloaded = store({ topN: 3 });
    await reloaded.load();
    expect(reloaded.entries().map((e) => e.name)).toEqual(["B", "D", "A"]);
  });

  test("two submissions on the same tick both land", async () => {
    const s = store();
    await s.load();
    const [first, second] = await Promise.all([
      s.submit([row({ name: "A", score: 10 })]),
      s.submit([row({ name: "B", score: 20 })]),
    ]);
    expect(first.written + second.written).toBe(2);
    expect(s.entries()).toHaveLength(2);
  });

  test("an unwritable path disables the ranking without throwing", async () => {
    const error = vi.fn();
    const blocked = path.join(dir, "a-file", "leaderboard.csv");
    await fs.writeFile(path.join(dir, "a-file"), "not a directory", "utf-8");
    const s = new LeaderboardStore({
      path: blocked,
      limits: LIMITS,
      log: { info: () => {}, warn: () => {}, error },
    });
    const outcome = await s.submit([row()]);
    expect(outcome).toEqual({ written: 0, skipped: 1 });
    expect(s.disabled).toBe(true);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("leaderboard"),
      expect.objectContaining({ path: blocked }),
    );
    // The store stops taking submissions instead of retrying forever.
    expect(await s.submit([row()])).toEqual({ written: 0, skipped: 1 });
    expect(error).toHaveBeenCalledTimes(1);
  });

  test("serializeLeaderboardRow keeps the documented column order", () => {
    expect(serializeLeaderboardRow(row())).toBe(
      "Alice,1200,3,1,abcdefghij,600,2026-10-17T12:00:00.000Z",
    );
  });
});
