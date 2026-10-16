import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { zInt, zRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Attack, Execution, Game, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/**
 * Autonomous land defense (SAM-style, ground-only) — spec v1.1 §R3/R4.
 *
 * R3 v1.1: every `defensePostAttackRate(level)` ticks an active, fully-built
 * post deals `defensePostDamage(level)` troop damage via direct attrition
 * (`victim.setTroops(troops - damage)`). Direct attrition IS compliance this
 * cycle; no ShellExecution ships (see Propuesta below, defect D1/A1).
 *
 * Targeting is deterministic: strongest stack wins, ties break by attacker
 * id. Only the owner's incoming land attacks qualify (R4.1): boat-borne
 * attacks (sourceTile !== null) are excluded per S3 (R4.3); diplomacy is
 * re-checked per volley via `owner.canAttackPlayer(attacker)` (R4.4) plus an
 * explicit disconnected-teammate guard (R4.5, D2); disabled posts silence
 * both channels (R4.6); under-construction posts stay silent (R4.7);
 * retreated attacks are never hit while retreating ones still qualify when
 * active, incoming, with troops > 0 and in range (R4.8); the first volley
 * lands at initTick + rate with lastAttackTick seeded at init (R4.9, D7);
 * range comes from the level-interpolated dynamicDefensePostRange over 45
 * ticks with a 75-tile passive scan, and is never 0 (D8).
 *
 * R5 feedback: the volley re-emits the post's Unit update on the existing
 * channel (no new wire, no DisplayEvent) so the client can pulse a 1-tick
 * ring + an existing sound cue off it; the engine delta and lastAttackTick
 * stay exactly verifiable.
 *
 * Propuesta (fuera de alcance): re-activate ShellExecution visuals against
 * landed hostile transports once desembarcos get their own spec.
 */
export class DefensePostExecution implements Execution {
  private mg: Game;
  private active: boolean = true;

  private lastAttackTick = 0;

  constructor(private post: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    // R4.9 (D7): seed the attrition clock at init so the first volley lands
    // at initTick + rate, never on a stale global 0.
    this.lastAttackTick = ticks;
  }

  tick(ticks: number): void {
    if (!this.post.isActive()) {
      this.active = false;
      return;
    }

    // Do nothing while the structure is under construction
    if (this.post.isUnderConstruction()) {
      return;
    }

    if (this.mg.config().isUnitDisabled(UnitType.DefensePost)) {
      return;
    }

    const config = this.mg.config();
    const level = this.post.level();
    if (ticks - this.lastAttackTick < config.defensePostAttackRate(level)) {
      return;
    }

    const victim = this.findVictimAttack(
      config.dynamicDefensePostRange(this.post, ticks),
    );
    if (victim === null) {
      return;
    }
    victim.setTroops(victim.troops() - config.defensePostDamage(level));
    this.lastAttackTick = ticks;
    // R5: re-emit the post on the existing Unit channel (no new wire, no
    // DisplayEvent) so the client can derive its 1-tick volley pulse + cue.
    this.mg.addUpdate(this.post.toUpdate());
  }

  /**
   * Strongest enemy land attack on the owner's territory with a border tile
   * inside `range` of the post. Boat attacks (sourceTile !== null) are
   * skipped per S3; `canAttackPlayer` enforces the diplomacy exclusions.
   */
  private findVictimAttack(range: number): Attack | null {
    const owner = this.post.owner();
    const rangeSquared = range * range;
    let best: Attack | null = null;
    for (const attack of owner.incomingAttacks()) {
      if (!attack.isActive() || attack.sourceTile() !== null) {
        continue;
      }
      // R4.8: retreated attacks are never hit; retreating ones still qualify
      // while active, incoming, with troops and in range.
      if (attack.retreated()) {
        continue;
      }
      if (attack.troops() <= 0) {
        continue;
      }
      const attacker = attack.attacker();
      if (attacker === owner || !owner.canAttackPlayer(attacker)) {
        continue;
      }
      // R4.5 (D2, explicit): a disconnected attacker on the owner's team is
      // never hit — canAttackPlayer alone treats them as attackable.
      if (attacker.isDisconnected() && attacker.isOnSameTeam(owner)) {
        continue;
      }
      let inRange = false;
      for (const tile of attack.borderTiles()) {
        if (
          this.mg.euclideanDistSquared(this.post.tile(), tile) <= rangeSquared
        ) {
          inRange = true;
          break;
        }
      }
      if (!inRange) {
        continue;
      }
      if (
        best === null ||
        attack.troops() > best.troops() ||
        (attack.troops() === best.troops() &&
          attacker.id() < best.attacker().id())
      ) {
        best = attack;
      }
    }
    return best;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return DefensePostExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      post: w.unit(this.post),
      lastAttackTick: this.lastAttackTick,
    });
  }

  restoreSnapshot(s: DefensePostState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.post = r.unit(s.post);
    this.lastAttackTick = s.lastAttackTick;
  }
}

const DefensePostStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  post: zRef(),
  lastAttackTick: zInt(),
});
type DefensePostState = z.infer<typeof DefensePostStateSchema>;

export const DefensePostExecutionSnapshot = execSnapshotType({
  name: "DefensePost",
  version: 2,
  schema: DefensePostStateSchema,
  cls: () => DefensePostExecution,
  migrations: {
    // v1 carried dead naval targeting state (target + shell cooldown set);
    // the cooldown maps onto the attrition clock, targets are re-acquired.
    1: (d) => ({
      active: d.active,
      initialized: d.initialized,
      post: d.post,
      lastAttackTick: d.lastShellAttack ?? 0,
    }),
  },
});
