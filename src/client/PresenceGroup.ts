import type {
  ServerMessage,
  ServerStartGameMessage,
} from "@zombie-defense/shared/WireSchemas";

/**
 * Local-only stand-in for the group-token helpers (docs/LocalMode.md R1).
 *
 * The token still rides the lobby/start messages (the wire schema is shared),
 * but nothing tracks it for presence any more: there is no desktop shell to
 * publish presence to. The two log-side helpers stay, because they keep the
 * token out of console logs players paste into bug reports.
 */

export function groupTokenOf(message: ServerMessage): string | undefined {
  if (message.type === "lobby_info" || message.type === "start") {
    return message.groupToken;
  }
  return undefined;
}

export function loggableStartMessage(
  message: ServerStartGameMessage,
): Record<string, unknown> {
  const loggable: Record<string, unknown> = { ...message };
  delete loggable.groupToken;
  return loggable;
}
