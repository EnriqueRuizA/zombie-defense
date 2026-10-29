import { GameID } from "@zombie-defense/engine-api/Schemas";
import { simpleHash } from "@zombie-defense/engine-lib/Util";
import { ClusterConfig } from "@zombie-defense/shared/ClusterConfig";
import {
  GameEnv,
  parseGameEnv,
} from "@zombie-defense/shared/configuration/Env";
import { generateGameID } from "@zombie-defense/shared/SharedUtil";

/**
 * Environment of the single local server (docs/LocalMode.md).
 *
 * Everything a deployed fleet needed — DOMAIN, SUBDOMAIN, INSTANCE_LETTER,
 * CLUSTER_JSON, JWT/JWKS, CDN, Turnstile, Stripe, Faro, telemetry, the API
 * key, the admin bot key, CASUAL_MODE — is gone. What is left is what a
 * process on this machine needs to fork workers, route game ids to them and
 * serve the page:
 *
 * - `NUM_WORKERS` (kept on purpose: it is how cross-worker lobby aggregation
 *   is exercised, R13 in the spec's decisions).
 * - `GAME_ENV` and `GIT_COMMIT`, only for display/build identity.
 *
 * No value here can point at another host: the only network address the
 * server ever listens on or hands to a client is loopback (R2/R3/R15).
 */
export class ServerEnv {
  private static readonly gameEnv: GameEnv = parseGameEnv(process.env.GAME_ENV);

  /** Loopback is the only bind address; `0.0.0.0`/`::` would leave the machine. */
  static readonly BIND_HOST = "127.0.0.1";
  /** The master's HTTP port; workers use 3001 + index (see workerPortByIndex). */
  static readonly MASTER_PORT = 3000;

  static env(): GameEnv {
    return ServerEnv.gameEnv;
  }

  static gameEnvName(): string {
    switch (ServerEnv.gameEnv) {
      case GameEnv.Dev:
        return "dev";
      case GameEnv.Preprod:
        return "staging";
      case GameEnv.Prod:
        return "prod";
    }
  }

  /**
   * Workers behind this server, from NUM_WORKERS. Ids route to workers by
   * hash % numWorkers, so this may only change while no local game is alive.
   * Defaults to 2 in dev, which is also what the Vite proxy expects.
   */
  static numWorkers(): number {
    const raw = process.env.NUM_WORKERS;
    if (raw === undefined || raw.length === 0) return 2;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid NUM_WORKERS: ${JSON.stringify(raw)}`);
    }
    return n;
  }

  static workerId(): number | undefined {
    const raw = process.env.WORKER_ID;
    if (raw === undefined) return undefined;
    return parseInt(raw, 10);
  }

  static workerIndex(gameID: GameID): number {
    return simpleHash(gameID) % ServerEnv.numWorkers();
  }

  static workerPath(gameID: GameID): string {
    return `w${ServerEnv.workerIndex(gameID)}`;
  }

  static workerPort(gameID: GameID): number {
    return ServerEnv.workerPortByIndex(ServerEnv.workerIndex(gameID));
  }

  static workerPortByIndex(index: number): number {
    return 3001 + index;
  }

  /**
   * Mint a local game id. The "a" letter is kept only because GameID's shape
   * is shared with the engine; nothing routes on it locally (R15: ids are
   * local and opaque).
   */
  static generateGameId(): GameID {
    return generateGameID("a");
  }

  /**
   * Generate an id that hashes to `workerId`, so requests for the game route
   * back to that worker. Rejection sampling: each id lands on a
   * uniformly-random worker, so the expected number of tries is numWorkers.
   */
  static generateGameIdForWorker(workerId: number): GameID | null {
    const maxAttempts = ServerEnv.numWorkers() * 100;
    for (let i = 0; i < maxAttempts; i++) {
      const id = ServerEnv.generateGameId();
      if (ServerEnv.workerIndex(id) === workerId) return id;
    }
    return null;
  }

  static turnIntervalMs(): number {
    return 100;
  }

  static gameCreationRate(): number {
    return ServerEnv.gameEnv === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;
  }

  static gitCommit(): string {
    return process.env.GIT_COMMIT ?? "DEV";
  }

  static instanceId(): string {
    return process.env.INSTANCE_ID ?? "";
  }

  // ---------------------------------------------------------------------------
  // Local-only compatibility surface.
  //
  // The local build has no accounts, API, CDN, telemetry, admin bot, payments
  // or multi-server routing. These accessors keep the remaining call sites
  // type-checking and, more importantly, answer with inert values so nothing
  // can reach another host: empty keys, loopback URLs and undefined optional
  // integrations. Code that still references them is scheduled for deletion
  // in the local-only cleanup; none of these values enables a network call.
  // ---------------------------------------------------------------------------

  /** Local mode is always on for this build. */
  static casualMode(): boolean {
    return true;
  }

  /** Nothing to refuse: the local build is not deployable to production. */
  static assertCasualBoot(): void {}

  static apiKey(): string {
    return "";
  }

  static jwtIssuer(): string {
    return `http://${ServerEnv.BIND_HOST}:${ServerEnv.MASTER_PORT}`;
  }

  static jwtAudience(): string {
    return "localhost";
  }

  static cdnBase(): string {
    return "";
  }

  static publicHost(): string | undefined {
    return undefined;
  }

  static siteHost(): string | undefined {
    return undefined;
  }

  static gameDomain(): string | undefined {
    return undefined;
  }

  static domain(): string {
    return "localhost";
  }

  static subdomain(): string {
    return "localhost";
  }

  static host(): string {
    return "localhost";
  }

  static hostname(): string {
    return "localhost";
  }

  static machine(): string | undefined {
    return undefined;
  }

  static pageHostFor(_host: string): string | undefined {
    return undefined;
  }

  static allowedFlares(): string[] | undefined {
    return undefined;
  }

  static adminBotKey(): string | undefined {
    return undefined;
  }

  static adminBotHeader(): string {
    return "x-admin-bot-key";
  }

  static otelEnabled(): boolean {
    return false;
  }

  static otelEndpoint(): string {
    return `http://${ServerEnv.BIND_HOST}:4318`;
  }

  static otelAuthHeader(): string | undefined {
    return undefined;
  }

  static lobbyCoordinator(): string | undefined {
    return undefined;
  }

  static turnstileSiteKey(): string {
    return "";
  }

  static stripePublishableKey(): string | undefined {
    return undefined;
  }

  static faroCollectorUrl(): string | undefined {
    return undefined;
  }

  /**
   * Inert leaderboard parameters. The local build does not persist scores;
   * the values only keep the (scheduled-for-deletion) submission path
   * type-checking.
   */
  static leaderboardConfig(): {
    path: string;
    topN: number;
    maxName: number;
    scoreMax: number;
    killsMax: number;
    minDurationS: number;
    minHumans: number;
    scope: "all" | "winners";
  } {
    return {
      path: "",
      topN: 10,
      maxName: 32,
      scoreMax: 1_000_000,
      killsMax: 100_000,
      minDurationS: 0,
      minHumans: 0,
      scope: "all",
    };
  }

  /**
   * The single local "cluster" the page reads. It names this origin's worker
   * count so a client can pick a `/w<n>/` path; there are no foreign hosts.
   */
  static cluster(): ClusterConfig {
    return {
      a: { host: "localhost", numWorkers: ServerEnv.numWorkers() },
    };
  }

  static instanceLetter(): string {
    return "a";
  }
}
