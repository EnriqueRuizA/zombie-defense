import { generateCryptoRandomUUID } from "./Utils";

/**
 * Local identity (docs/LocalMode.md R5).
 *
 * No accounts, no JWT, no refresh, no session: a player is a UUID stored in
 * `localStorage` plus a locally chosen nick. The server accepts the UUID as
 * the client token, so there is no signature, issuer, audience or expiry to
 * carry — and nothing that can fail when the machine is offline.
 *
 * `getPersistentID()` is the whole of it: read the key, mint a UUID v4 when
 * it is missing, and fall back to an in-memory UUID when `localStorage` is
 * unavailable (a hardened browser profile, a file:// page, a jsdom test).
 * The fallback lives for the lifetime of the tab: the point of the key is
 * that two tabs of the same profile are the same player, and a tab that
 * cannot persist at least stays stable while it is open.
 */
const PERSISTENT_ID_KEY = "player_persistent_id";

let memoryPersistentID: string | null = null;

/**
 * The local player's UUID, creating and storing it on first use.
 *
 * Never throws: an unreadable or full `localStorage` degrades to the
 * in-memory UUID instead of taking the client down.
 */
export function getPersistentID(): string {
  if (memoryPersistentID !== null) return memoryPersistentID;
  let stored: string | null;
  try {
    stored = localStorage.getItem(PERSISTENT_ID_KEY);
  } catch {
    stored = null;
  }
  if (stored !== null && stored !== "") {
    memoryPersistentID = stored;
    return stored;
  }
  const fresh = generateCryptoRandomUUID();
  memoryPersistentID = fresh;
  try {
    localStorage.setItem(PERSISTENT_ID_KEY, fresh);
  } catch {
    // No persistence available: the in-memory UUID above is the identity for
    // the rest of the tab's life.
  }
  return fresh;
}

/** Test-only: drop the cached UUID so the next read re-reads storage. */
export function resetPersistentID(): void {
  memoryPersistentID = null;
}

/**
 * The token a game join sends: the local UUID itself. There is no login step
 * between "page loaded" and "join", so this never waits on a network.
 */
export async function getPlayToken(): Promise<string> {
  return getPersistentID();
}

/** The claims a locally identified player has: their own UUID. */
export interface LocalClaims {
  sub: string;
}

/**
 * Resolve the local identity for a join.
 *
 * Always the UUID: the value is never `false`, because there is no state in
 * which a local player could fail to be identified.
 */
export async function userAuth(): Promise<{ claims: LocalClaims }> {
  return { claims: { sub: getPersistentID() } };
}

/**
 * No `Authorization` header exists locally (docs/LocalMode.md: "No
 * Authorization header, refresh, logout, session"). Callers that used to
 * gate a request on a session get an empty header and take their own
 * "no session" branch.
 */
export async function getAuthHeader(): Promise<string> {
  return "";
}

/**
 * There is nothing to log out of. Kept as a no-op so any call site that
 * still exists resolves without touching the network.
 */
export async function logOut(_allSessions: boolean = false): Promise<boolean> {
  return true;
}
