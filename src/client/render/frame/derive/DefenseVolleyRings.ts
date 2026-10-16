import type { UnitUpdate } from "@zombie-defense/engine-api/game/GameUpdates";
import { UnitType } from "@zombie-defense/engine-api/game/GameTypes";
import type { AttackRingInput, UnitState } from "../../types";

/**
 * Defense-post volley rings (spec v1.1 §R5/D6).
 *
 * The engine re-emits the post's Unit update on the EXISTING Unit channel on
 * every volley (no new wire, no DisplayEvent). A volley touch changes no
 * visible state, so it is detectable only by elimination: a DefensePost
 * update for an active, fully-built post whose level / construction /
 * ownership signature is unchanged since the previous tick (and which is not
 * being seen for the first time) can only be a volley. Construction finish,
 * upgrades, captures and first sight all change the signature and stay
 * silent; the ring therefore pulses for exactly the volley tick (1 tick).
 *
 * Rings ride the existing FrameData.attackRings array into the existing
 * FxAttackRingPass with negative unit ids (real unit ids are >= 0), so no
 * renderer or wire changes are needed.
 */

/** Ring key for a post volley. Never collides with transport-ship rings. */
export function volleyRingId(postId: number): number {
  return -postId - 1;
}

function postSig(st: UnitState): string {
  return `${st.level}|${st.underConstruction ? 1 : 0}|${st.ownerID}`;
}

/**
 * Derive 1-tick volley rings from this tick's Unit updates. `sigs` is the
 * caller's long-lived per-post signature map, updated in place (first sight
 * only records, never rings).
 */
export function extractDefenseVolleyRings(
  updates: ReadonlyArray<UnitUpdate>,
  states: ReadonlyMap<number, UnitState>,
  sigs: Map<number, string>,
  mapW: number,
): AttackRingInput[] {
  // One evaluation per post: a tick carrying both a state change (e.g. an
  // upgrade) and a volley touch must not pulse.
  const posts = new Set<number>();
  for (const u of updates) {
    if (u.unitType === UnitType.DefensePost) posts.add(u.id);
  }
  const rings: AttackRingInput[] = [];
  for (const id of posts) {
    const st = states.get(id);
    if (st === undefined || !st.isActive || st.underConstruction) {
      if (st !== undefined) sigs.set(id, postSig(st));
      continue;
    }
    const sig = postSig(st);
    const prev = sigs.get(id);
    sigs.set(id, sig);
    if (prev === undefined || prev !== sig) continue;
    const pos = st.pos;
    rings.push({ x: pos % mapW, y: (pos - (pos % mapW)) / mapW, unitId: volleyRingId(id) });
  }
  return rings;
}
