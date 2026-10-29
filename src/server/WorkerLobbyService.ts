import { GameConfig } from "@zombie-defense/engine-api/Schemas";
import { CloseCode, CloseReason } from "@zombie-defense/shared/CloseCodes";
import {
  ClientPlatform,
  ClientPlatformSchema,
  PublicGameInfo,
  PublicGames,
  PublicLobbyMessage,
} from "@zombie-defense/shared/WireSchemas";
import { encodeLobbyMessage } from "@zombie-defense/shared/ZbinWire";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { GameManager } from "./GameManager";
import {
  InternalGameInfo,
  InternalPublicGames,
  MasterMessageSchema,
  WorkerLobbyList,
  WorkerReady,
} from "./IPCBridgeSchema";
import { logger } from "./Logger";
import { ServerEnv } from "./ServerEnv";

/**
 * Host-only fields are stripped from the lobby config before it is
 * advertised: a local lobby is joinable by anyone, so whitelists, name
 * reveals, host cheats and pool siblings never need to leave the server.
 */
function publicLobbyGameConfig(gc: GameConfig): GameConfig {
  const sanitized = { ...gc };
  delete sanitized.allowedPublicIds;
  delete sanitized.nameReveals;
  delete sanitized.nameRevealPublicIds;
  delete sanitized.hostCheats;
  delete sanitized.pool;
  return sanitized;
}

/**
 * One worker's view of the local lobby list (docs/LocalMode.md R7/R8).
 *
 * Every game in lobby phase, with a free slot, is advertised as a plain local
 * lobby. There is no listing flag, no public/private distinction, no
 * featured/queued metadata and no cap: a lobby exists in the list for exactly
 * as long as the worker reports it in lobby phase, so it disappears on start,
 * on fill and when it is reaped.
 */
export class WorkerLobbyService {
  private readonly lobbiesWss: WebSocketServer;
  private readonly lobbyClients: Map<WebSocket, ClientPlatform | "unknown"> =
    new Map();
  // Most recent snapshot from master, serialized on demand for new
  // connections so they don't have to wait for the next broadcast.
  private lastPublicGames: InternalPublicGames | null = null;
  // Fingerprint of the last full snapshot sent to browsers. When it changes a
  // fresh full is sent; otherwise a counts-only delta is enough.
  private lastFullGameIds: string | null = null;

  constructor(
    private readonly server: http.Server,
    private readonly gameWss: WebSocketServer,
    private readonly gm: GameManager,
    private readonly log: typeof logger,
  ) {
    this.lobbiesWss = new WebSocketServer({
      noServer: true,
      maxPayload: 256 * 1024,
    });
    this.setupUpgradeHandler();
    this.setupLobbiesWebSocket();
    this.setupIPCListener();
  }

  /**
   * Local mode never drains: the single server has nowhere to route players
   * to. Kept for the (scheduled-for-deletion) ranked loop call site.
   */
  isDeploymentActive(): boolean {
    return true;
  }

  /**
   * Listing/queue feature stubs. Local mode advertises every lobby, so there
   * is no per-creator listing registry and no cap to enforce.
   */
  creatorHasListedLobby(_creatorID: string, _gameID: string): boolean {
    return false;
  }

  hostedLobbyCount(): number {
    return 0;
  }

  /** Browsers currently connected to this worker's /lobbies socket. */
  connectedClients(): number {
    return this.lobbyClients.size;
  }

  /** Same, per platform, zeros included. */
  connectedClientsByPlatform(): Map<ClientPlatform | "unknown", number> {
    const counts = new Map<ClientPlatform | "unknown", number>(
      [...ClientPlatformSchema.options, "unknown" as const].map((p) => [p, 0]),
    );
    for (const platform of this.lobbyClients.values()) {
      counts.set(platform, counts.get(platform)! + 1);
    }
    return counts;
  }

  private setupIPCListener() {
    process.on("message", (raw: unknown) => this.handleMasterMessage(raw));
  }

  // Separate from setupIPCListener so tests can dispatch messages without
  // touching the real process IPC channel (which vitest forks use).
  private handleMasterMessage(raw: unknown) {
    const result = MasterMessageSchema.safeParse(raw);
    if (!result.success) {
      this.log.error("Invalid IPC message from master:", raw);
      return;
    }

    const msg = result.data;
    this.lastPublicGames = msg.publicGames;
    this.broadcastLobbiesToClients(msg.publicGames);
    // Update master with my lobby info, so the next snapshot includes any
    // lobby that appeared since this broadcast.
    this.sendMyLobbiesToMaster();
  }

  sendReady(workerId: number) {
    this.sendToMaster({ type: "workerReady", workerId });
  }

  private sendToMaster(msg: WorkerReady | WorkerLobbyList) {
    process.send?.(msg);
  }

  private sendMyLobbiesToMaster() {
    const lobbies = this.gm.lobbies().map((game) => {
      const info = game.gameInfo();
      return {
        gameID: info.gameID,
        numClients: info.clients?.length ?? 0,
        startsAt: info.startsAt,
        gameConfig:
          info.gameConfig && publicLobbyGameConfig(info.gameConfig),
        publicGameType: "hosted",
        createdAt: game.createdAt,
      } satisfies InternalGameInfo;
    });
    this.sendToMaster({
      type: "lobbyList",
      lobbies,
    } satisfies WorkerLobbyList);
  }

  // Strips the master/worker-internal creation time before lobby info is
  // sent to browser clients.
  private sanitizeGames(
    games: InternalPublicGames["games"],
  ): PublicGames["games"] {
    const sanitized: PublicGames["games"] = {};
    for (const [type, list] of Object.entries(games) as [
      keyof PublicGames["games"],
      InternalGameInfo[],
    ][]) {
      sanitized[type] = list.map(
        ({ createdAt: _createdAt, ...rest }): PublicGameInfo => rest,
      );
    }
    return sanitized;
  }

  private setupUpgradeHandler() {
    this.server.on("upgrade", (request, socket, head) => {
      const pathname = (request.url ?? "").split("?")[0];
      if (pathname === "/lobbies" || pathname.endsWith("/lobbies")) {
        this.lobbiesWss.handleUpgrade(request, socket, head, (ws) => {
          this.lobbiesWss.emit("connection", ws, request);
        });
      } else {
        this.gameWss.handleUpgrade(request, socket, head, (ws) => {
          this.gameWss.emit("connection", ws, request);
        });
      }
    });
  }

  private setupLobbiesWebSocket() {
    this.lobbiesWss.on(
      "connection",
      (ws: WebSocket, request?: http.IncomingMessage) => {
        this.lobbyClients.set(ws, lobbyClientPlatform(request?.url));
        // Prime the new client with the most recent snapshot — otherwise it
        // would only see counts-only deltas (which it can't apply without a
        // base) until the next structural change.
        if (this.lastPublicGames !== null) {
          ws.send(
            encodeLobbyMessage({
              type: "full",
              serverTime: this.lastPublicGames.serverTime,
              games: this.sanitizeGames(this.lastPublicGames.games),
              gitCommit: ServerEnv.gitCommit(),
              active: true,
            } satisfies PublicLobbyMessage),
          );
        }
        ws.on("message", () => {
          ws.terminate();
        });
        ws.on("close", () => {
          this.lobbyClients.delete(ws);
        });

        ws.on("error", (error) => {
          const code = (error as { code?: unknown }).code;
          if (typeof code === "string" && code.startsWith("WS_ERR_")) {
            this.log.warn("Lobbies WebSocket peer protocol error", { code });
          } else {
            this.log.error(`Lobbies WebSocket error:`, error);
          }
          this.lobbyClients.delete(ws);
          try {
            if (
              ws.readyState === WebSocket.OPEN ||
              ws.readyState === WebSocket.CONNECTING
            ) {
              ws.close(CloseCode.InternalError, CloseReason.InternalError);
            }
          } catch (closeError) {
            this.log.error("Error closing lobbies WebSocket:", closeError);
          }
        });
      },
    );
  }

  private broadcastLobbiesToClients(publicGames: InternalPublicGames) {
    const sanitizedGames = this.sanitizeGames(publicGames.games);
    const lobbyTokens: string[] = [];
    for (const list of Object.values(sanitizedGames)) {
      for (const lobby of list) {
        // JSON.stringify drops undefined-valued keys, excluding the count.
        lobbyTokens.push(JSON.stringify({ ...lobby, numClients: undefined }));
      }
    }
    lobbyTokens.sort();
    const fingerprint = lobbyTokens.join(",");
    const shouldSendFull = fingerprint !== this.lastFullGameIds;

    let payload: PublicLobbyMessage;
    if (shouldSendFull) {
      payload = {
        type: "full",
        serverTime: publicGames.serverTime,
        games: sanitizedGames,
        gitCommit: ServerEnv.gitCommit(),
        active: true,
      };
      this.lastFullGameIds = fingerprint;
    } else {
      const counts: Record<string, number> = {};
      for (const list of Object.values(publicGames.games)) {
        for (const lobby of list) {
          counts[lobby.gameID] = lobby.numClients;
        }
      }
      payload = {
        type: "counts",
        serverTime: publicGames.serverTime,
        counts,
      };
    }
    const frame = encodeLobbyMessage(payload);

    const clientsToRemove: WebSocket[] = [];
    for (const client of this.lobbyClients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(frame);
      } else {
        clientsToRemove.push(client);
      }
    }

    clientsToRemove.forEach((client) => {
      this.lobbyClients.delete(client);
    });
  }
}

// The platform a lobby client announced in its upgrade URL. Anything missing
// or unrecognised counts as unknown.
function lobbyClientPlatform(
  url: string | undefined,
): ClientPlatform | "unknown" {
  const query = url?.split("?")[1];
  if (query === undefined) return "unknown";
  const parsed = ClientPlatformSchema.safeParse(
    new URLSearchParams(query).get("platform"),
  );
  return parsed.success ? parsed.data : "unknown";
}
