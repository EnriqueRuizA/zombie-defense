import { GameConfigPatch } from "@zombie-defense/engine-api/Schemas";
import { GameEvent } from "@zombie-defense/shared/EventBus";

// Sent from the lobby screens, which load before the game client: here, not
// in Transport, so emitting them doesn't pull the connection into the
// homepage's bundle.

export class SendKickPlayerIntentEvent implements GameEvent {
  constructor(public readonly target: string) {}
}

export class SendUpdateGameConfigIntentEvent implements GameEvent {
  constructor(public readonly config: GameConfigPatch) {}
}

export class SendToggleGameStartTimer implements GameEvent {
  constructor() {}
}
