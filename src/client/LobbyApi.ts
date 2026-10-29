import type { GameInfo } from "@zombie-defense/shared/WireSchemas";
import { ClientEnv } from "./ClientEnv";
import { getPlayToken } from "./Auth";

/**
 * Local lobby creation against this origin's game server
 * (docs/LocalMode.md R1/R13).
 *
 * The API worker's list, audience and "outdated" checks are gone: there is
 * exactly one server, it is the one serving this page, and it mints the id.
 */
export async function createLobby(): Promise<{
  lobby: GameInfo;
  creatorToken: string;
}> {
  const token = await getPlayToken();
  const response = await fetch(`${ClientEnv.serverHttpBase()}/api/create_game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Server error response:", errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as GameInfo;
  return { lobby: data, creatorToken: token };
}

/**
 * POST /wX/api/create_game?previous=<gameID>, targeted at the worker that
 * owns the finished game — mints a successor private lobby (same creator,
 * default settings) and has the old game broadcast the new id to everyone
 * still connected. Returns the successor's info; the caller navigates the
 * host there. Idempotent server-side: repeat calls return the same
 * successor.
 *
 * Errors propagate to the caller (GameRightSidebar's successor-lobby
 * button), which logs, re-enables the button and shows the failure alert —
 * the right answer for "there is no server to create it on".
 */
export async function createNextLobby(
  previousGameID: string,
): Promise<GameInfo> {
  const token = await getPlayToken();
  const url = `${ClientEnv.gameHttpBase(previousGameID)}/${ClientEnv.gameWorkerPath(previousGameID)}/api/create_game?previous=${previousGameID}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("createNextLobby: server error response:", errorText);
    throw new Error(`create next lobby failed: HTTP ${response.status}`);
  }
  return (await response.json()) as GameInfo;
}
