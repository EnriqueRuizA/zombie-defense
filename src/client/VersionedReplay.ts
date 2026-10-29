/**
 * Local-only stand-in for the versioned replay shell (docs/LocalMode.md R1/R2).
 *
 * There is no `replay.<domain>` host serving other builds' bundles, so no
 * hostname is ever a shell host and no cross-build navigation is offered.
 */

export function isReplayShellHost(_hostname: string): boolean {
  return false;
}

export async function findVersionedShell(
  _audience: string,
  _gameID: string,
  _hostname: string,
  _fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  return null;
}
