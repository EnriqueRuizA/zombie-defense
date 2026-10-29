import { PublicGameType } from "@zombie-defense/shared/WireSchemas";
import { Worker } from "cluster";
import winston from "winston";
import {
  InternalGameInfo,
  InternalGameInfoSchema,
  MasterLobbiesBroadcast,
  WorkerMessageSchema,
} from "./IPCBridgeSchema";
import { ServerEnv } from "./ServerEnv";

/**
 * Aggregates the lobby lists of every local worker and broadcasts one
 * deterministic snapshot to all of them (docs/LocalMode.md R7/R8).
 *
 * There is no scheduler, no public queue, no coordinator, no per-creator
 * dedupe and no listing cap: any game in lobby phase with a free slot is a
 * local lobby, and it is advertised until it starts, fills or disappears.
 */
export class MasterLobbyService {
  private readonly workers = new Map<number, Worker>();
  // Worker id => the lobbies it owns.
  private readonly workerLobbies = new Map<number, InternalGameInfo[]>();
  private readonly readyWorkers = new Set<number>();
  private started = false;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly log: winston.Logger) {}

  registerWorker(workerId: number, worker: Worker) {
    this.workers.set(workerId, worker);

    worker.on("message", (raw: unknown) => {
      const result = WorkerMessageSchema.safeParse(raw);
      if (!result.success) {
        this.log.error("Invalid IPC message from worker:", raw);
        return;
      }

      const msg = result.data;
      switch (msg.type) {
        case "workerReady":
          this.handleWorkerReady(msg.workerId);
          break;
        case "lobbyList":
          this.workerLobbies.set(workerId, this.validLobbies(msg.lobbies));
          break;
      }
    });
  }

  // Lobby entries are validated individually so one malformed entry only
  // drops itself, instead of freezing this worker's whole view.
  private validLobbies(lobbies: unknown[]): InternalGameInfo[] {
    const valid: InternalGameInfo[] = [];
    for (const lobby of lobbies) {
      const result = InternalGameInfoSchema.safeParse(lobby);
      if (result.success) {
        valid.push(result.data);
      } else {
        this.log.error("Dropping invalid lobby in worker report:", lobby);
      }
    }
    return valid;
  }

  removeWorker(workerId: number) {
    this.workers.delete(workerId);
    this.workerLobbies.delete(workerId);
    this.readyWorkers.delete(workerId);
  }

  isHealthy(): boolean {
    // Healthy while at least half of the workers are ready; a crashed worker
    // is restarted by the master.
    const minWorkers = Math.max(ServerEnv.numWorkers() / 2, 1);
    return this.started && this.readyWorkers.size >= minWorkers;
  }

  private handleWorkerReady(workerId: number) {
    this.readyWorkers.add(workerId);
    this.log.info(
      `Worker ${workerId} is ready. (${this.readyWorkers.size}/${ServerEnv.numWorkers()} ready)`,
    );
    if (this.readyWorkers.size === ServerEnv.numWorkers() && !this.started) {
      this.started = true;
      this.log.info("All workers ready, broadcasting local lobbies");
      this.broadcastTimer = setInterval(() => this.broadcastLobbies(), 500);
    }
  }

  /**
   * Every lobby every worker reported, ordered by creation time and then by
   * id (R8). All of them travel under the legacy `hosted` bucket; locally
   * there is no public/scheduled/listed distinction.
   */
  private getAllLobbies(): Record<PublicGameType, InternalGameInfo[]> {
    const games: Record<PublicGameType, InternalGameInfo[]> = {
      ffa: [],
      team: [],
      special: [],
      hosted: [],
    };
    const lobbies = Array.from(this.workerLobbies.values()).flat();
    lobbies.sort((a, b) => {
      const created = (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (created !== 0) return created;
      return a.gameID > b.gameID ? 1 : a.gameID < b.gameID ? -1 : 0;
    });
    for (const lobby of lobbies) {
      games.hosted.push(lobby);
    }
    return games;
  }

  private broadcastLobbies() {
    const msg = {
      type: "lobbiesBroadcast",
      publicGames: {
        serverTime: Date.now(),
        games: this.getAllLobbies(),
      },
    } satisfies MasterLobbiesBroadcast;
    for (const [workerId, worker] of this.workers.entries()) {
      worker.send(msg, (e) => {
        if (e) {
          this.log.error(
            `Failed to send lobbies broadcast to worker ${workerId}, killing worker:`,
            e,
          );
          worker.kill();
        }
      });
    }
  }

  /** Test/process teardown. */
  stop() {
    if (this.broadcastTimer !== null) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }
}
