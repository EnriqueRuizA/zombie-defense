import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import { PlaySoundEffectEvent, SoundEffect } from "../sound/Sounds";
import { SendSpawnIntentEvent } from "../Transport";
import { GameView, UnitView } from "../view";

// A MIRV rains hundreds of warheads over a few seconds; playing a boom per
// warhead churns the audio pipeline. Play at most one warhead boom per interval.
const MIRV_HIT_SOUND_INTERVAL_TICKS = 5;

// Several nukes can be announced inbound on the same tick (multiple silos,
// multiple attackers); don't stack the alarm and evict other cues.
const NUKE_WARNING_SOUND_INTERVAL_TICKS = 10;

// A new factory stations every owned City/Port/Factory within range on the
// same tick (FactoryExecution.createStation); play the cue once, not N times.
const TRAIN_STATION_SOUND_INTERVAL_TICKS = 10;

// hadTrainStation is keyed by unit id and normally cleared when the unit goes
// inactive, but one that leaves view without ever delivering that update would
// sit there for the rest of the session. Sweep it occasionally instead. 100
// ticks is ten seconds or so: far more often than the leak could matter, and
// rare enough that the scan costs nothing.
const TRAIN_STATION_SWEEP_INTERVAL_TICKS = 100;

// Defense-post volleys re-emit the post's Unit update on the existing
// channel (no new wire, no DisplayEvent); at most one volley cue per
// interval so a multi-post line does not stack cues and evict others.
const DEFENSE_VOLLEY_SOUND_INTERVAL_TICKS = 10;

// Structures a train station can be attached to (see TrainStationExecution).
const STATION_CAPABLE_TYPES = new Set<UnitType>([
  UnitType.City,
  UnitType.Factory,
  UnitType.Port,
]);

const NUKE_INBOUND_MESSAGES = new Set<MessageType>([
  MessageType.NUKE_INBOUND,
  MessageType.HYDROGEN_BOMB_INBOUND,
  MessageType.MIRV_INBOUND,
]);

export class SoundEffectController implements Controller {
  private lastMirvHitSoundTick = -Infinity;
  private lastNukeWarningSoundTick = -Infinity;
  private lastTrainStationSoundTick = -Infinity;
  private lastDefenseVolleySoundTick = -Infinity;
  // Per-post volley signature (level|construction|owner), mirroring
  // extractDefenseVolleyRings: a volley touch changes no visible state, so an
  // update with an unchanged signature (and not first sight) is a volley.
  private readonly postVolleySigs = new Map<number, string>();
  private hadTrainStation = new Map<number, boolean>();
  private lastTrainStationSweepTick = -Infinity;

  constructor(
    private readonly game: GameView,
    private readonly eventBus: EventBus,
  ) {}

  init(): void {
    // On the intent, not the sim confirmation: the cue answers the player's
    // click, and re-placing the spawn should sound every time.
    this.eventBus.on(SendSpawnIntentEvent, this.onSpawnIntent);
  }

  private onSpawnIntent = (): void => {
    // Spectators can click unowned land too, but their intent is dropped
    // server-side — no false confirmation cue.
    if (this.game.myPlayer() === null) return;
    this.emit("spawn");
  };

  tick(): void {
    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    this.pruneTrainStations();

    // One evaluation per post: a tick carrying both a state change (upgrade,
    // construction finish, capture) and a volley touch must not cue.
    const volleyPosts = new Set<number>();

    for (const u of updates[GameUpdateType.Unit] ?? []) {
      const unit = this.game.unit(u.id);
      if (unit === undefined) continue;
      this.handleUnit(unit);
      if (u.unitType === UnitType.DefensePost) volleyPosts.add(u.id);
    }
    this.handleDefenseVolleys(volleyPosts);

    if ((updates[GameUpdateType.SpawnPhaseEnd] ?? []).length > 0) {
      this.emit("game-start");
    }

    const myPlayer = this.game.myPlayer();
    if (myPlayer === null) return;
    for (const c of updates[GameUpdateType.ConquestEvent] ?? []) {
      if (c.conquerorId === myPlayer.id()) {
        // Battle cue for conquering a real player; the ka-ching payout
        // stays for bots and nations.
        const conquered = this.game.player(c.conqueredId);
        this.emit(
          conquered.type() === PlayerType.Human ? "conquered" : "ka-ching",
        );
      }
    }

    for (const u of updates[GameUpdateType.UnitIncoming] ?? []) {
      if (u.playerID !== myPlayer.smallID()) continue;
      if (!NUKE_INBOUND_MESSAGES.has(u.messageType)) continue;
      const tick = this.game.ticks();
      if (
        tick - this.lastNukeWarningSoundTick <
        NUKE_WARNING_SOUND_INTERVAL_TICKS
      ) {
        continue;
      }
      this.lastNukeWarningSoundTick = tick;
      this.emit("nuke-warning");
    }
  }

  private handleUnit(unit: UnitView): void {
    if (unit.isActive() && unit.createdAt() === this.game.ticks()) {
      this.onCreated(unit);
    }
    if (STATION_CAPABLE_TYPES.has(unit.type())) {
      this.handleTrainStation(unit);
    }
    switch (unit.type()) {
      case UnitType.AtomBomb:
        this.onNukeDetonation(unit, "atom-hit");
        break;
      case UnitType.MIRVWarhead:
        this.onMirvWarheadDetonation(unit);
        break;
      case UnitType.HydrogenBomb:
        this.onNukeDetonation(unit, "hydrogen-hit");
        break;
    }
  }

  /**
   * R5/D6 volley cue (spec: existing sound, no new wire, no DisplayEvent).
   * A DefensePost Unit update whose signature is unchanged since the previous
   * tick is a volley touch. Only the local player's own posts cue, throttled
   * to one per interval. Reuses the existing "conquered" battle cue — no new
   * asset per the spec freeze.
   */
  private handleDefenseVolleys(postIds: ReadonlySet<number>): void {
    if (postIds.size === 0) return;
    const myPlayer = this.game.myPlayer();
    for (const id of postIds) {
      const unit = this.game.unit(id);
      if (unit === undefined) continue;
      const st = unit.state;
      const sig = `${st.level}|${st.underConstruction ? 1 : 0}|${st.ownerID}`;
      const prev = this.postVolleySigs.get(id);
      this.postVolleySigs.set(id, sig);
      if (prev === undefined || prev !== sig) continue;
      if (!unit.isActive() || unit.isUnderConstruction()) continue;
      if (myPlayer === null || unit.owner() !== myPlayer) continue;
      const tick = this.game.ticks();
      if (
        tick - this.lastDefenseVolleySoundTick <
        DEFENSE_VOLLEY_SOUND_INTERVAL_TICKS
      ) {
        continue;
      }
      this.lastDefenseVolleySoundTick = tick;
      this.emit("conquered");
    }
  }

  private onMirvWarheadDetonation(unit: UnitView): void {
    if (unit.isActive()) return;
    if (!unit.reachedTarget()) return;
    const tick = this.game.ticks();
    if (tick - this.lastMirvHitSoundTick < MIRV_HIT_SOUND_INTERVAL_TICKS) {
      return;
    }
    this.lastMirvHitSoundTick = tick;
    this.emit("atom-hit");
  }

  private onCreated(unit: UnitView): void {
    const myPlayer = this.game.myPlayer();
    switch (unit.type()) {
      case UnitType.AtomBomb:
        this.emit("atom-launch");
        break;
      case UnitType.HydrogenBomb:
        this.emit("hydrogen-launch");
        break;
      case UnitType.MIRV:
        this.emit("mirv-launch");
        break;
      case UnitType.Warship:
        if (unit.owner() === myPlayer) this.emit("build-warship");
        break;
      case UnitType.City:
        if (unit.owner() === myPlayer) this.emit("build-city");
        break;
      case UnitType.Port:
        if (unit.owner() === myPlayer) this.emit("build-port");
        break;
      case UnitType.DefensePost:
        if (unit.owner() === myPlayer) this.emit("build-defense-post");
        break;
      case UnitType.SAMLauncher:
        if (unit.owner() === myPlayer) this.emit("sam-built");
        break;
      case UnitType.MissileSilo:
        if (unit.owner() === myPlayer) this.emit("silo-built");
        break;
      case UnitType.Factory:
        if (unit.owner() === myPlayer) this.emit("build-factory");
        break;
      case UnitType.TransportShip:
        if (unit.owner() === myPlayer) this.emit("transport-ship");
        break;
    }
  }

  /**
   * Drops entries for structures that are gone.
   *
   * No cue can be lost to this. GameView only removes a unit once it is
   * inactive (it queues the id on the tick isActive() goes false), so both
   * arms of the test below mean destroyed, and a destroyed structure never
   * comes back to gain a station. The sweep is the same condition
   * handleTrainStation already applies, catching the units whose final update
   * never reached it.
   *
   * Nor can one be replayed, which is what the `prev === false` check in
   * handleTrainStation is for rather than a plain falsy test: a structure
   * whose entry has gone reads as undefined, not false, so it is treated like
   * one first seen with a station already and stays silent.
   */
  private pruneTrainStations(): void {
    const tick = this.game.ticks();
    if (
      tick - this.lastTrainStationSweepTick <
      TRAIN_STATION_SWEEP_INTERVAL_TICKS
    ) {
      return;
    }
    this.lastTrainStationSweepTick = tick;
    for (const id of this.hadTrainStation.keys()) {
      const unit = this.game.unit(id);
      if (unit === undefined || !unit.isActive()) {
        this.hadTrainStation.delete(id);
      }
    }
  }

  private handleTrainStation(unit: UnitView): void {
    if (!unit.isActive()) {
      this.hadTrainStation.delete(unit.id());
      return;
    }
    const hasStation = unit.hasTrainStation();
    const prev = this.hadTrainStation.get(unit.id());
    if (prev === false && hasStation && unit.owner() === this.game.myPlayer()) {
      const tick = this.game.ticks();
      if (
        tick - this.lastTrainStationSoundTick >=
        TRAIN_STATION_SOUND_INTERVAL_TICKS
      ) {
        this.lastTrainStationSoundTick = tick;
        this.emit("build-train-station");
      }
    }
    this.hadTrainStation.set(unit.id(), hasStation);
  }

  private onNukeDetonation(unit: UnitView, sound: SoundEffect): void {
    if (unit.isActive()) return;
    if (!unit.reachedTarget()) return;
    this.emit(sound);
  }

  private emit(sound: SoundEffect): void {
    this.eventBus.emit(new PlaySoundEffectEvent(sound));
  }
}
