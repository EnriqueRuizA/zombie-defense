/**
 * Local-only stand-in for the multi-server list (docs/LocalMode.md R1/R13).
 *
 * The real module discovers game servers through an external API and can
 * answer "outdated" when a newer build fronts the cluster. Local mode has no
 * such API: the page's own values are always in charge, so discovery resolves
 * immediately to "fallback" and nothing ever offers a reload-to-rescue.
 */

export const MANUAL_RETRY_COOLDOWN_MS = 5_000;

export type ServerListStatus =
  // A list named a server for this build and it was applied.
  | "api"
  // The page's own values are in charge (always the case locally).
  | "fallback"
  // A newer build fronts the cluster (never: there is no cluster).
  | "outdated";

export interface BackendReachabilityDetail {
  readonly reachable: boolean;
  readonly confirmed: boolean;
}

export async function ensureServerList(): Promise<ServerListStatus> {
  return "fallback";
}

export async function refreshServerList(): Promise<ServerListStatus> {
  return "fallback";
}

export async function retryServerList(): Promise<ServerListStatus> {
  return "fallback";
}

/** Never: a reload cannot fetch a newer build when there is no cluster. */
export function reloadWouldRescue(_status?: ServerListStatus): boolean {
  return false;
}

/** Never: the game is local, so its path is already this build's path. */
export function redirectToGameVersion(
  _lobbyId?: string,
  _spectator?: boolean,
): boolean {
  return false;
}

/** Never: there is no list API to be unreachable. */
export function backendUnreachableConfirmed(): boolean {
  return false;
}

/** Always: no attempt is ever in flight against an API that does not exist. */
export function manualRetryAvailable(): boolean {
  return true;
}

/** Never: local pages are not pinned to a `/v/<commit>/` shell. */
export function isPinnedToAVersion(): boolean {
  return false;
}

/** Never: there is no other build to navigate to. */
export function versionedPathForMismatchedGame(
  _gameID?: string,
  _gitCommit?: string,
): string | null {
  return null;
}
