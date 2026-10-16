import { UnitType } from "@zombie-defense/engine-api/game/GameTypes";
import { GameConfig } from "@zombie-defense/engine-api/Schemas";
import { Config } from "@zombie-defense/engine-lib/configuration/Config";
import { EngineConfig } from "@zombie-defense/engine/configuration/EngineConfig";
import { describe, expect, it } from "vitest";

describe("EngineConfig.unitInfo", () => {
  for (const instantBuild of [false, true]) {
    const gameConfig = { instantBuild } as unknown as GameConfig;
    const shared = new Config(gameConfig, false);
    const engine = new EngineConfig(gameConfig, false);

    it(`adds a cost to the shared unit stats (instantBuild=${instantBuild})`, () => {
      for (const type of Object.values(UnitType)) {
        const { cost, ...stats } = engine.unitInfo(type);
        expect(stats).toEqual(shared.unitInfo(type));
        expect(typeof cost).toBe("function");
      }
    });
  }

  it("caches per unit type", () => {
    const engine = new EngineConfig({} as unknown as GameConfig, false);
    expect(engine.unitInfo(UnitType.City)).toBe(engine.unitInfo(UnitType.City));
  });
});
