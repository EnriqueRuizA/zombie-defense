import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { LeaderboardStore } from "./LeaderboardStore";
import { logger } from "./Logger";

// GET /api/leaderboard (R25): unauthenticated, no-store, rate-limited per IP.
// Reads ONLY the master's in-memory copy — never the file, never packages/
// (R27), and nothing it returns feeds back into the simulation.

/** Requests per IP per window the route allows. */
export const LEADERBOARD_RATE_LIMIT = 30;
export const LEADERBOARD_RATE_WINDOW_MS = 60_000;
/** Applied when ?limit= is absent or unusable. */
export const LEADERBOARD_DEFAULT_LIMIT = 25;
/** Hard ceiling for ?limit=, independent of LEADERBOARD_TOP_N. */
export const LEADERBOARD_MAX_LIMIT = 1000;

const log = logger.child({ component: "LeaderboardRoute" });

/** ?limit=N -> a bounded integer; anything else -> the default. */
export function parseLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return LEADERBOARD_DEFAULT_LIMIT;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return LEADERBOARD_DEFAULT_LIMIT;
  return Math.min(n, LEADERBOARD_MAX_LIMIT);
}

export interface LeaderboardRouteOptions {
  store: LeaderboardStore;
  // Injected so a test can count without scraping logs.
  rateLimit?: {
    windowMs: number;
    limit: number;
  };
}

export function createLeaderboardRouter(
  options: LeaderboardRouteOptions,
): Router {
  const router = Router();
  const rate = options.rateLimit ?? {
    windowMs: LEADERBOARD_RATE_WINDOW_MS,
    limit: LEADERBOARD_RATE_LIMIT,
  };

  router.use(
    rateLimit({
      windowMs: rate.windowMs,
      limit: rate.limit,
      standardHeaders: true,
      legacyHeaders: false,
      // The error payload is ours, not the library's, so the client only has
      // to understand one shape.
      handler: (_req, res) => {
        res
          .status(429)
          .json({ error: "rate_limited", retryAfterMs: rate.windowMs });
      },
    }),
  );

  router.get("/leaderboard", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (options.store.disabled) {
      // R13: a broken ranking answers honestly instead of a stale board.
      res.status(503).json({ error: "leaderboard_unavailable" });
      return;
    }
    const limit = parseLimit(req.query.limit);
    res.json({
      generatedAt: new Date().toISOString(),
      entries: options.store.entries().slice(0, limit),
    });
  });

  return router;
}

/** Mounts the route at /api/leaderboard on an express app. */
export function mountLeaderboardRoute(
  app: express.Express,
  options: LeaderboardRouteOptions,
): void {
  app.use("/api", createLeaderboardRouter(options));
  log.info("leaderboard route mounted", { file: options.store.file });
}
