import express from "express";
import fs from "fs/promises";
import type http from "http";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createLeaderboardRouter,
  LEADERBOARD_DEFAULT_LIMIT,
  parseLimit,
} from "../src/server/LeaderboardRoute";
import {
  LeaderboardRow,
  LeaderboardStore,
  serializeLeaderboard,
} from "../src/server/LeaderboardStore";

const LIMITS = {
  topN: 100,
  maxName: 24,
  scoreMax: 10_000_000,
  killsMax: 100_000,
};

function row(i: number): LeaderboardRow {
  return {
    name: `P${i}`,
    score: i * 100,
    kills: i,
    won: (i % 2) as 0 | 1,
    game_id: "abcdefghij",
    duration_s: 600,
    at: "2026-10-17T12:00:00.000Z",
  };
}

describe("parseLimit", () => {
  test("defaults when absent or unusable", () => {
    expect(parseLimit(undefined)).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(parseLimit("abc")).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(parseLimit("0")).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(parseLimit("-5")).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(parseLimit("12")).toBe(12);
  });

  test("caps at the hard ceiling", () => {
    expect(parseLimit("99999")).toBe(1000);
  });
});

describe("GET /api/leaderboard", () => {
  let dir: string;
  let file: string;
  let server: http.Server;
  let base: string;
  let store: LeaderboardStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "leaderboard-route-"));
    file = path.join(dir, "leaderboard.csv");
    store = new LeaderboardStore({
      path: file,
      limits: LIMITS,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await fs.writeFile(
      file,
      serializeLeaderboard(Array.from({ length: 30 }, (_, i) => row(i + 1))),
      "utf-8",
    );
    await store.load();

    const app = express();
    app.use(
      "/api",
      createLeaderboardRouter({
        store,
        // Tests exercise the handler, not the clock: the default of 30 a
        // minute would make the 429 case wait on real time.
        rateLimit: { windowMs: 60_000, limit: 5 },
      }),
    );
    server = app.listen(0);
    await new Promise<void>((resolve) =>
      server.once("listening", () => resolve()),
    );
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a tcp address");
    }
    base = `http://127.0.0.1:${address.port}/api/leaderboard`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("answers the ranked board with a generatedAt and no-store", async () => {
    const res = await fetch(`${base}?limit=3`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as {
      generatedAt: string;
      entries: { rank: number; name: string; score: number; won: 0 | 1 }[];
    };
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
    expect(body.entries.map((e) => [e.rank, e.name, e.score])).toEqual([
      [1, "P30", 3000],
      [2, "P29", 2900],
      [3, "P28", 2800],
    ]);
    // R25: the client-facing shape carries no game id or duration.
    expect(Object.keys(body.entries[0]!).sort()).toEqual([
      "at",
      "kills",
      "name",
      "rank",
      "score",
      "won",
    ]);
  });

  test("defaults to the documented page size", async () => {
    const body = (await (await fetch(base)).json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(LEADERBOARD_DEFAULT_LIMIT);
  });

  test("rate-limits per IP once the budget is spent", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await fetch(base)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);

    const limited = await fetch(base);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "rate_limited",
      retryAfterMs: 60_000,
    });
  });

  test("answers 503 once the ranking is disabled (R13)", async () => {
    const blocked = path.join(dir, "a-file", "leaderboard.csv");
    await fs.writeFile(path.join(dir, "a-file"), "not a directory", "utf-8");
    const broken = new LeaderboardStore({
      path: blocked,
      limits: LIMITS,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await broken.submit([row(1)]);

    const app = express();
    app.use("/api", createLeaderboardRouter({ store: broken }));
    const brokenServer = app.listen(0);
    await new Promise<void>((resolve) =>
      brokenServer.once("listening", () => resolve()),
    );
    const address = brokenServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a tcp address");
    }
    const res = await fetch(`http://127.0.0.1:${address.port}/api/leaderboard`);
    await new Promise<void>((resolve, reject) =>
      brokenServer.close((err) => (err ? reject(err) : resolve())),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "leaderboard_unavailable" });
  });
});
