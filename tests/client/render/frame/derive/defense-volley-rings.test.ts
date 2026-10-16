/**
 * extractDefenseVolleyRings (spec v1.1 §R5/D6): the engine re-emits the
 * post's Unit update on the existing channel per volley, changing no visible
 * state. A DefensePost update for an active, fully-built post whose
 * level/construction/ownership signature is unchanged — and which is not
 * being seen for the first time — is a volley and pulses exactly one ring.
 * Construction finish, upgrades, captures and first sight stay silent.
 */

import { UnitType } from "@zombie-defense/engine-api/game/GameTypes";
import type { UnitUpdate } from "@zombie-defense/engine-api/game/GameUpdates";
import { describe, expect, it } from "vitest";
import {
  extractDefenseVolleyRings,
  volleyRingId,
} from "../../../../../src/client/render/frame/derive/DefenseVolleyRings";
import type { UnitState } from "../../../../../src/client/render/types";

const MAP_W = 100;

function st(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: 7,
    unitType: "Defense Post",
    ownerID: 1,
    lastOwnerID: null,
    pos: 12_34,
    lastPos: 12_34,
    isActive: true,
    reachedTarget: false,
    retreating: false,
    targetable: true,
    waitTicks: 0,
    markedForDeletion: false,
    health: null,
    underConstruction: false,
    targetUnitId: null,
    targetTile: null,
    troops: 0,
    missileTimerQueue: [],
    level: 1,
    veterancy: 0,
    hasTrainStation: false,
    trainType: null,
    loaded: null,
    constructionStartTick: null,
    samUpgradeStartTick: null,
    samUpgradeStartRange: null,
    samUpgradeTargetLevel: null,
    samUpgradeDuration: null,
    ...overrides,
  } as UnitState;
}

function upd(id: number): UnitUpdate {
  return { id, unitType: UnitType.DefensePost } as unknown as UnitUpdate;
}

describe("extractDefenseVolleyRings", () => {
  it("stays silent on first sight, then pulses exactly one ring per volley tick", () => {
    const sigs = new Map<number, string>();
    const states = new Map([[7, st()]]);
    // First sight only records.
    expect(extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W)).toEqual(
      [],
    );
    // Unchanged signature → volley: ring at the post tile, negative unit id.
    const rings = extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual({
      x: 12_34 % MAP_W,
      y: (12_34 - (12_34 % MAP_W)) / MAP_W,
      unitId: volleyRingId(7),
    });
    expect(volleyRingId(7)).toBeLessThan(0);
    // No update next tick → no ring (1-tick pulse).
    expect(extractDefenseVolleyRings([], states, sigs, MAP_W)).toEqual([]);
  });

  it("stays silent on upgrade, capture, construction and inactive posts", () => {
    const sigs = new Map<number, string>();
    const states = new Map([[7, st()]]);
    extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W); // record
    // Upgrade changes the level → silent, signature updated.
    states.set(7, st({ level: 2 }));
    expect(extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W)).toEqual(
      [],
    );
    // Steady at level 2 → volleys again.
    expect(
      extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W),
    ).toHaveLength(1);
    // Capture changes owner → silent.
    states.set(7, st({ level: 2, ownerID: 2 }));
    expect(extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W)).toEqual(
      [],
    );
    // Under construction → silent.
    states.set(7, st({ level: 2, ownerID: 2, underConstruction: true }));
    expect(extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W)).toEqual(
      [],
    );
    // Inactive → silent.
    states.set(
      7,
      st({ level: 2, ownerID: 2, underConstruction: false, isActive: false }),
    );
    expect(extractDefenseVolleyRings([upd(7)], states, sigs, MAP_W)).toEqual(
      [],
    );
  });

  it("ignores non-post updates and evaluates one ring per post per tick", () => {
    const sigs = new Map<number, string>();
    const states = new Map([
      [7, st()],
      [9, st({ id: 9, pos: 55 })],
    ]);
    const city = {
      id: 8,
      unitType: UnitType.City,
    } as unknown as UnitUpdate;
    extractDefenseVolleyRings([upd(7), city, upd(9)], states, sigs, MAP_W);
    // Duplicate entries for the same post on one tick still pulse once.
    const rings = extractDefenseVolleyRings(
      [upd(7), upd(7), upd(9), upd(9)],
      states,
      sigs,
      MAP_W,
    );
    expect(rings.map((r) => r.unitId)).toEqual([
      volleyRingId(7),
      volleyRingId(9),
    ]);
  });
});
