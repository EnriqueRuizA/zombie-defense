import { GameID } from "@zombie-defense/engine-api/Schemas";
import { simpleHash } from "@zombie-defense/engine-lib/Util";
import { GameEnv, parseGameEnv } from "@zombie-defense/shared/configuration/Env";

/**
 * No server is known: the page carries no worker count at all.
 *
 * Raised by numWorkers() and propagated by every accessor that derives a
 * worker route from it — workerIndex(), workerPath() and gameWorkerPath().
 * Those have no truthful answer without a server, so they fail at URL-build
 * time instead of routing to a worker that does not own the game.
 * (gamePath() is the deliberate exception: it catches this and falls back to
 * the worker-free `/game/<id>` shape.)
 *
 * Typed so callers can tell "there is no server" from a programming error and
 * route it into the connection-failed path they already have
 * (LobbySocket.handleConnectError, Transport) rather than letting it surface
 * as an uncaught exception.
 *
 * Local-only build (docs/LocalMode.md): the game server is always this
 * page's own origin, so the only way to get here is a page that carries no
 * `BOOTSTRAP_CONFIG.numWorkers`/`cluster` at all.
 */
export class NoServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoServerError";
  }
}

/**
 * Values that flow from the local server → client via index.html. Set on the
 * server from process.env, then re-hydrated on the client from
 * window.BOOTSTRAP_CONFIG.
 *
 * Local-only (docs/LocalMode.md): only the values a local build needs. No
 * audience, no site key, no Stripe/Faro, no fleet map of foreign hosts, no
 * server-list state — every request goes to this page's own origin.
 */
export interface ClientEnvValues {
  gameEnv: GameEnv;
  /** Worker count of THIS local server, when the page names one. */
  cluster?: Record<string, { host: string; numWorkers: number }>;
  instanceLetter?: string;
  numWorkers?: number;
  gitCommit: string;
}

export class ClientEnv {
  private static values: ClientEnvValues | null = null;

  /** Test-only. */
  static reset(): void {
    ClientEnv.values = null;
  }

  private static get(): ClientEnvValues {
    if (ClientEnv.values) return ClientEnv.values;
    if (typeof window === "undefined") {
      throw new Error("ClientEnv is only available on the browser main thread");
    }
    const bc = window.BOOTSTRAP_CONFIG;
    // Only the values that are the same for every player are required. The
    // local build needs an environment and a build identity; the worker count
    // has a local fallback (NUM_WORKERS, default 2) below.
    if (!bc || bc.gameEnv === undefined || bc.gitCommit === undefined) {
      throw new Error("Missing BOOTSTRAP_CONFIG");
    }
    ClientEnv.values = {
      gameEnv: parseGameEnv(bc.gameEnv),
      // The local Node cluster: the page a game server rendered carries the
      // one-entry map plus its own letter; older/local pages carry the plain
      // numWorkers scalar. Either shape is THIS server's worker count.
      cluster: bc.cluster,
      instanceLetter: bc.instanceLetter,
      numWorkers: bc.numWorkers,
      gitCommit: bc.gitCommit,
    };
    return ClientEnv.values;
  }

  static env(): GameEnv {
    return ClientEnv.get().gameEnv;
  }
  static gitCommit(): string {
    return ClientEnv.get().gitCommit;
  }

  /**
   * Worker count of the local server this page talks to.
   *
   * Same-origin by construction: the cluster map this page carries, if any,
   * is the local server's own one-entry map (docs/LocalMode.md keeps the Node
   * cluster to prove cross-worker lobby aggregation). Falls back to the
   * legacy scalar, then to the local default, so a page that names no count
   * still routes to a worker of the server serving it.
   */
  static numWorkers(): number {
    const v = ClientEnv.get();
    if (v.cluster !== undefined && v.instanceLetter !== undefined) {
      const own = v.cluster[v.instanceLetter];
      if (own !== undefined) return own.numWorkers;
    }
    if (v.numWorkers !== undefined) return v.numWorkers;
    return 2;
  }

  static turnIntervalMs(): number {
    return 100;
  }
  static gameCreationRate(): number {
    return ClientEnv.env() === GameEnv.Dev ? 5 * 1000 : 2 * 60 * 1000;
  }
  static workerIndex(gameID: GameID): number {
    return simpleHash(gameID) % ClientEnv.numWorkers();
  }
  static workerPath(gameID: GameID): string {
    return `w${ClientEnv.workerIndex(gameID)}`;
  }
  /**
   * Which worker owns a game: always this server (docs/LocalMode.md R15 —
   * no multi-server, ids are local and opaque).
   */
  static resolveGame(_gameID: GameID): GameResolution {
    return { kind: "own" };
  }
  /** No foreign letters exist locally, so nothing to redirect for. */
  static gameLetterUnknown(_gameID: GameID): boolean {
    return false;
  }
  /** No version pinning locally: the page is always the local build. */
  static gameVersion(_gameID: GameID): string | undefined {
    return undefined;
  }
  static gameWsBase(_gameID: GameID): string {
    return ClientEnv.serverWsBase();
  }
  static gameHttpBase(_gameID: GameID): string {
    return ClientEnv.serverHttpBase();
  }
  /** Origin to navigate to for a game's page: this page's own origin. */
  static gameNavigateBase(_gameID: GameID): string {
    return ClientEnv.serverHttpBase();
  }
  /**
   * The same-origin path that opens a game: `/w<n>/game/<id>` when a worker
   * count is known, plain `/game/<id>` when none is.
   *
   * For share links, history entries and "open this game" navigations — NOT
   * for API calls, which hit the owning worker over gameHttpBase.
   */
  static gamePath(gameID: GameID): string {
    const id = encodeURIComponent(gameID);
    try {
      return `/${ClientEnv.gameWorkerPath(gameID)}/game/${id}`;
    } catch (e) {
      if (e instanceof NoServerError) return `/game/${id}`;
      throw e;
    }
  }
  // The worker path on this server: ids are local, so the game's worker is
  // derived from this server's own worker count.
  static gameWorkerPath(gameID: GameID): string {
    return ClientEnv.workerPath(gameID);
  }

  /**
   * Origin (scheme + host, no trailing slash) of the game server that hosts
   * the lobby-list and game WebSockets. Always this page's origin: the local
   * server rendered the page, so `window.location` IS the server.
   *
   * Never throws: a local page always has an origin to answer with.
   */
  static serverWsBase(): string {
    return deriveServerWsBase(undefined, window.location.protocol, window.location.host);
  }
  /**
   * Origin (scheme + host, no trailing slash) of the same game server's HTTP
   * API — worker routes under `/api`. Same-origin, like serverWsBase.
   */
  static serverHttpBase(): string {
    return deriveServerHttpBase(undefined, window.location.protocol, window.location.host);
  }

  /**
   * Where a link meant to leave this page should point: the document's own
   * origin. There is no other host in a local build.
   */
  static shareOrigin(): string {
    return deriveShareOrigin(
      shareBootstrap,
      window.location.protocol,
      window.location.origin,
    );
  }
  static shareBase(): string {
    return deriveShareBase(
      shareBootstrap,
      window.location.protocol,
      window.location.origin,
      window.location.pathname,
    );
  }
}

/**
 * BOOTSTRAP_CONFIG values the share helpers need, read on demand.
 *
 * A thunk, not two arguments, so the helpers can decide the http(s) case
 * without touching the bootstrap at all: reading it means REQUIRING it, and a
 * plain web page (or a jsdom test rendering a copy button) must not start
 * depending on BOOTSTRAP_CONFIG merely to build a link to itself.
 */
function shareBootstrap(): { siteOrigin?: string } {
  return { siteOrigin: undefined };
}

export type GameResolution =
  | { kind: "own" }
  | { kind: "cross"; host: string; numWorkers: number }
  | { kind: "unknown-letter" };

/**
 * Game-server WebSocket origin: same-origin (no explicit server host exists
 * in a local build), so scheme and host come from `window.location`.
 */
export function deriveServerWsBase(
  _serverHost: string | undefined,
  locationProtocol: string,
  locationHost: string,
): string {
  const secure = locationProtocol === "https:";
  return `${secure ? "wss:" : "ws:"}//${locationHost}`;
}

/** Game-server HTTP origin: same-origin, see deriveServerWsBase. */
export function deriveServerHttpBase(
  _serverHost: string | undefined,
  locationProtocol: string,
  locationHost: string,
): string {
  const secure = locationProtocol === "https:";
  return `${secure ? "https:" : "http:"}//${locationHost}`;
}

/** Whether an origin on this scheme is a real web address someone else can open. */
function isWebScheme(locationProtocol: string): boolean {
  return locationProtocol === "http:" || locationProtocol === "https:";
}

/**
 * Where a link meant to LEAVE this client should point.
 *
 * On the web that is the document's own origin: the page the copier is
 * looking at is the page the recipient should get. A local build has no other
 * host, so the `app:`/non-web case (an Electron shell) answers the same way
 * it does for a plain web page — there is no site origin to fall back to.
 */
export function deriveShareOrigin(
  _bootstrap: () => { siteOrigin?: string },
  locationProtocol: string,
  locationOrigin: string,
): string {
  if (isWebScheme(locationProtocol)) return locationOrigin;
  return locationOrigin;
}

/**
 * deriveShareOrigin plus the page path to hang a `#hash` link off — what a
 * modal's copy-link button wants, since the modals are hash-routed. The web
 * keeps the current path; anything else starts at "/".
 */
export function deriveShareBase(
  bootstrap: () => { siteOrigin?: string },
  locationProtocol: string,
  locationOrigin: string,
  locationPathname: string,
): string {
  const origin = deriveShareOrigin(bootstrap, locationProtocol, locationOrigin);
  return isWebScheme(locationProtocol)
    ? `${origin}${locationPathname}`
    : `${origin}/`;
}
