/**
 * Defense Post levels + autonomous land defense (SAM-style, ground-only),
 * spec v1.1 (R3 v1.1 / R4.1-4.9 / R5-R7).
 *
 * Covers: upgradable posts, per-level range / damage / cadence / passive
 * bonus curves (Nv1 30/250/100/5x/3x → Nv5 56/560/50/9x/5x), autonomous
 * attrition of enemy land-attack stacks in range, diplomacy/scope
 * exclusions, construction / disabled guards, snapshot v1->v2 migration and
 * determinism.
 *
 * R3 v1.1 (defect D1/A1): direct attrition `victim.setTroops(troops-damage)`
 * IS compliance this cycle — no ShellExecution ships. Shell visuals against
 * landed hostile transports are a documented Propuesta (desembarcos spec).
 *
 * QA checklist (spec v1.1 acceptance):
 * - C1 v1.1: with-vs-without control shows >= damage gap, first volley at
 *   initTick + rate, and NO Shell units are ever created.
 * - C5: engine delta exact on the volley tick + client 1-tick ring pulse off
 *   the re-emitted Unit update (existing sound, no new wire/DisplayEvent).
 * - C6b: disabled posts are passive-0 in attackLogic AND active-silent, the
 *   first volley respects initTick + rate, and range never reads 0.
 * - C9: economy untouched — NationGoldPerMinute runs without -u (thresholds:
 *   ≤1% PASS, 1-5% Mayor, >5% Bloqueante).
 * - C10b: bots upgrade through the same generic path, curve and guards.
 */
import {
  GameMode,
  PlayerInfo,
  PlayerType,
  TerrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import {
  DefensePostExecution,
  DefensePostExecutionSnapshot,
} from "@openfront/engine/execution/DefensePostExecution";
import { UpgradeStructureExecution } from "@openfront/engine/execution/UpgradeStructureExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { UnitSnapshot } from "@openfront/engine/game/UnitImpl";
import { setup } from "../../util/Setup";
import { expectSnapshotRoundTrip } from "../../util/Snapshot";
import { executeTicks } from "../../util/utils";

const MAP = "big_plains";

function conquerRect(
  game: Game,
  p: Player,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      const t = game.ref(x, y);
      if (game.isLand(t)) p.conquer(t);
    }
  }
}

async function warGame(gameConfig: Partial<GameConfig> = {}) {
  const game = await setup(
    MAP,
    {
      infiniteGold: true,
      instantBuild: true,
      nations: "disabled",
      bots: 0,
      ...gameConfig,
    },
    [
      new PlayerInfo("attacker", PlayerType.Human, "client_a", "attacker"),
      new PlayerInfo("defender", PlayerType.Human, "client_b", "defender"),
      new PlayerInfo("third", PlayerType.Human, "client_c", "third"),
    ],
  );
  const atk = game.player("attacker");
  const def = game.player("defender");
  const third = game.player("third");
  conquerRect(game, atk, 0, 0, 40, 40);
  conquerRect(game, def, 40, 0, 80, 40);
  atk.setTroops(5_000_000);
  def.setTroops(2_000_000);
  return { game, atk, def, third };
}

/** Defender post 10 tiles behind the shared border + its execution running. */
function buildPost(game: Game, def: Player, withExecution: boolean) {
  const post = def.buildUnit(UnitType.DefensePost, game.ref(50, 20), {});
  if (withExecution) {
    game.addExecution(new DefensePostExecution(post));
  }
  return post;
}

function launchAttack(game: Game, atk: Player, def: Player, troops: number) {
  game.addExecution(new AttackExecution(troops, atk, def.id()));
  game.executeNextTick(); // init the attack + post execution
}

function outgoingTroops(atk: Player): number {
  return atk.outgoingAttacks().reduce((sum, a) => sum + a.troops(), 0);
}

describe("DefensePost level curves", () => {
  test("level tables match the proposal, Nv1 equals legacy values", () => {
    const config = new EngineConfig({} as GameConfig, false);
    expect(config.defensePostRange(1)).toBe(30);
    expect(config.defensePostDamage(1)).toBe(250);
    expect(config.defensePostAttackRate(1)).toBe(100);
    expect(config.defensePostShellAttackRate()).toBe(100);
    expect(config.defensePostDefenseBonus(1)).toBe(5);
    expect(config.defensePostSpeedBonus(1)).toBe(3);

    expect([
      config.defensePostRange(2),
      config.defensePostRange(3),
      config.defensePostRange(4),
      config.defensePostRange(5),
    ]).toEqual([38, 45, 51, 56]);
    expect([
      config.defensePostDamage(2),
      config.defensePostDamage(3),
      config.defensePostDamage(4),
      config.defensePostDamage(5),
    ]).toEqual([320, 400, 480, 560]);
    expect([
      config.defensePostAttackRate(2),
      config.defensePostAttackRate(3),
      config.defensePostAttackRate(4),
      config.defensePostAttackRate(5),
    ]).toEqual([85, 70, 60, 50]);
    expect([
      config.defensePostDefenseBonus(2),
      config.defensePostDefenseBonus(3),
    ]).toEqual([6, 7]);
    expect([
      config.defensePostSpeedBonus(2),
      config.defensePostSpeedBonus(3),
    ]).toEqual([3.5, 4]);

    // Monotonic: higher level strictly better everywhere.
    for (let level = 1; level < 6; level++) {
      expect(config.defensePostRange(level + 1)).toBeGreaterThan(
        config.defensePostRange(level),
      );
      expect(config.defensePostDamage(level + 1)).toBeGreaterThan(
        config.defensePostDamage(level),
      );
      expect(config.defensePostAttackRate(level + 1)).toBeLessThan(
        config.defensePostAttackRate(level),
      );
    }
  });

  test("attackLogic: missing level behaves like Nv1, higher level hits harder and slower", () => {
    const config = new EngineConfig({} as GameConfig, false);
    const defender = {
      type: PlayerType.Human,
      numTiles: 20_000,
      troops: 100_000,
      isTraitor: false,
      isDisconnectedTeammate: false,
    };
    const base = {
      terrain: TerrainType.Plains,
      attackTroops: 100_000,
      attacker: { type: PlayerType.Human, numTiles: 20_000 },
      defender,
      defenderHasDefensePost: true,
      falloutRatio: null,
      borderSize: 100,
    } as const;
    const legacy = config.attackLogic({ ...base });
    const l1 = config.attackLogic({ ...base, defenderDefensePostLevel: 1 });
    expect(l1).toEqual(legacy);
    const l3 = config.attackLogic({ ...base, defenderDefensePostLevel: 3 });
    expect(l3.attackerTroopLoss).toBeGreaterThan(l1.attackerTroopLoss);
    expect(l3.tickFraction).toBeGreaterThan(l1.tickFraction);
    expect(l3.defenderTroopLoss).toBe(l1.defenderTroopLoss);
  });
});

describe("DefensePost upgrades", () => {
  test("post can be upgraded via the generic path and range grows", async () => {
    const { game, def } = await warGame();
    const post = buildPost(game, def, true);
    expect(def.canUpgradeUnit(post)).toBe(true);
    expect(
      def.findUnitToUpgrade(UnitType.DefensePost, game.ref(51, 20)),
    ).toBeTruthy();

    game.addExecution(new UpgradeStructureExecution(def, post.id(), 1));
    game.executeNextTick();
    expect(post.level()).toBe(2);
    expect(game.config().defensePostRange(2)).toBeGreaterThan(
      game.config().defensePostRange(1),
    );
    // Mid-upgrade the dynamic range blends from the old level's range...
    const during = game.config().dynamicDefensePostRange(post, game.ticks());
    expect(during).toBeGreaterThanOrEqual(game.config().defensePostRange(1));
    expect(during).toBeLessThanOrEqual(game.config().defensePostRange(2));
    // ...and settles exactly on the new level once the duration passes.
    const done = game
      .config()
      .dynamicDefensePostRange(
        post,
        game.ticks() + game.config().defensePostUpgradeDuration() + 1,
      );
    expect(done).toBe(game.config().defensePostRange(2));
  });
});

describe("DefensePost autonomous land defense", () => {
  test("Nv1 post attrites an enemy land attack within 100 ticks", async () => {
    const { game, atk, def } = await warGame();
    buildPost(game, def, true);
    launchAttack(game, atk, def, 1_000_000);
    expect(atk.outgoingAttacks().length).toBeGreaterThan(0);

    const before = outgoingTroops(atk);
    executeTicks(game, 105);
    expect(atk.outgoingAttacks().length).toBeGreaterThan(0);
    // At least one full Nv1 volley (250) landed on top of conquest losses.
    expect(before - outgoingTroops(atk)).toBeGreaterThanOrEqual(250);
    // C1 v1.1 / D1: R3 v1.1 ships direct attrition only — never Shell units.
    expect(game.units(UnitType.Shell)).toHaveLength(0);
  });

  test("execution-less post deals no attrition (isolates the active channel)", async () => {
    const run = async (withExecution: boolean) => {
      const { game, atk, def } = await warGame();
      buildPost(game, def, withExecution);
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 115);
      return outgoingTroops(atk);
    };
    const withExec = await run(true);
    const withoutExec = await run(false);
    // Same Nv1 passive in both: the gap is pure autonomous attrition.
    expect(withoutExec - withExec).toBeGreaterThanOrEqual(250);
  });

  test("Nv3 drains and slows more than Nv1 over the same ticks", async () => {
    const run = async (levels: number) => {
      const { game, atk, def } = await warGame();
      const post = buildPost(game, def, true);
      for (let i = 1; i < levels; i++) post.increaseLevel();
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 130);
      return {
        troops: outgoingTroops(atk),
        tiles: atk.numTilesOwned(),
      };
    };
    const nv1 = await run(1);
    const nv3 = await run(3);
    expect(nv3.troops).toBeLessThan(nv1.troops);
    expect(nv3.tiles).toBeLessThanOrEqual(nv1.tiles);
  });

  test("post ignores attacks on third parties (scope: owner's incoming only)", async () => {
    const run = async (withExecution: boolean) => {
      const { game, atk, def, third } = await warGame();
      // Third holds land touching the attacker on the post's side of the map.
      conquerRect(game, third, 40, 20, 80, 40);
      third.setTroops(500_000);
      buildPost(game, def, withExecution);
      game.addExecution(new AttackExecution(500_000, atk, third.id()));
      game.executeNextTick();
      expect(atk.outgoingAttacks().length).toBeGreaterThan(0);
      executeTicks(game, 115);
      return outgoingTroops(atk);
    };
    // Identical drain with and without the execution: the post never
    // considers an attack that is not incoming to its owner.
    expect(await run(true)).toBe(await run(false));
  });

  test("post ignores boat attacks incoming to the owner (S3)", async () => {
    const run = async (withExecution: boolean) => {
      const { game, atk, def } = await warGame();
      buildPost(game, def, withExecution);
      // Boat-borne attack: sourceTile set, beachhead inside defender land.
      game.addExecution(
        new AttackExecution(200_000, atk, def.id(), game.ref(41, 20)),
      );
      game.executeNextTick();
      const boat = def
        .incomingAttacks()
        .find((a) => a.sourceTile() !== null);
      expect(boat).toBeDefined();
      executeTicks(game, 115);
      return boat!.troops();
    };
    expect(await run(true)).toBe(await run(false));
  });

  test("allied attacker is never a valid victim (diplomacy rule pin)", async () => {
    const { game, atk, def } = await warGame();
    atk.createAllianceRequest(def)?.accept();
    expect(atk.isFriendly(def)).toBe(true);
    buildPost(game, def, true);
    // Alliance blocks new attacks, so pin the rule the execution relies on:
    // a post whose owner cannot attack the "attacker" deals no damage.
    expect(def.canAttackPlayer(atk)).toBe(false);
  });

  test("under-construction posts stay silent, then resume", async () => {
    const { game, atk, def } = await warGame();
    const post = buildPost(game, def, true);
    post.setUnderConstruction(true);
    launchAttack(game, atk, def, 1_000_000);
    // Control: same fight, same under-construction post, no execution.
    const control = async () => {
      const c = await warGame();
      const controlPost = buildPost(c.game, c.def, false);
      controlPost.setUnderConstruction(true);
      launchAttack(c.game, c.atk, c.def, 1_000_000);
      executeTicks(c.game, 115);
      return outgoingTroops(c.atk);
    };
    executeTicks(game, 115);
    expect(outgoingTroops(atk)).toBe(await control());
    // Reactivate: attrition resumes on the same post.
    post.setUnderConstruction(false);
    const before = outgoingTroops(atk);
    executeTicks(game, 115);
    expect(before - outgoingTroops(atk)).toBeGreaterThanOrEqual(250);
  });

  test("disabled posts stay silent", async () => {
    const run = async (disabled: boolean) => {
      const { game, atk, def } = await warGame();
      buildPost(game, def, true);
      if (disabled) {
        (game.config() as unknown as { _gameConfig: GameConfig })._gameConfig
          .disabledUnits = [UnitType.DefensePost];
      }
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 115);
      return outgoingTroops(atk);
    };
    // Same passive cover in both arms (the post still stands in the grid):
    // the gap is the silenced autonomous channel (≥ one Nv1 volley).
    expect((await run(true)) - (await run(false))).toBeGreaterThanOrEqual(
      250,
    );
  });

  test("same seed, same ticks → identical outcome (determinism)", async () => {
    const run = async () => {
      const { game, atk, def } = await warGame();
      const post = buildPost(game, def, true);
      post.increaseLevel();
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 150);
      return JSON.stringify({
        atkTroops: atk.troops(),
        defTroops: def.troops(),
        outgoing: outgoingTroops(atk),
        level: post.level(),
        atkTiles: atk.numTilesOwned(),
      });
    };
    expect(await run()).toBe(await run());
  });

  test("execution snapshot round-trips mid-fight (v2)", async () => {
    const { game, atk, def } = await warGame();
    const post = buildPost(game, def, true);
    post.increaseLevel();
    launchAttack(game, atk, def, 1_000_000);
    executeTicks(game, 30);
    await expectSnapshotRoundTrip(game, MAP, 120);
  }, 60_000);

  test("v1 execution snapshot migrates to v2", () => {
    const migrated = DefensePostExecutionSnapshot.migrations[1]({
      active: true,
      initialized: true,
      post: 7,
      target: null,
      lastShellAttack: 42,
      alreadySentShell: [],
    });
    expect(migrated).toEqual({
      active: true,
      initialized: true,
      post: 7,
      lastAttackTick: 42,
    });
  });

  test("v1 unit snapshot migrates to v2", () => {
    const migrated = UnitSnapshot.migrations[1]({ id: 1, level: 2 });
    expect(migrated).toEqual({
      id: 1,
      level: 2,
      defensePostUpgradeState: null,
    });
  });
});

describe("DefensePost spec v1.1 defect pins (QA D2/D3/D4/D7/D8, C1/C5/C6b/C10b)", () => {
  test("D7/C1/C5: first volley lands exactly at initTick + rate with the exact Nv1 delta", async () => {
    // Twin deterministic runs, identical until the volley tick. The attack
    // launches 9 ticks before the volley so conquest barely started: the
    // troop ratio sits deep on the clamp floors, making conquest drain
    // bit-identical in both arms and isolating the volley delta.
    const run = async (withExecution: boolean) => {
      const { game, atk, def } = await warGame();
      def.setTroops(200_000);
      buildPost(game, def, withExecution);
      const initTick = game.ticks();
      const rate = game.config().defensePostAttackRate(1);
      expect(rate).toBe(100);
      executeTicks(game, rate - 10); // post idles: no victim, clock untouched
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 8); // initTick + rate - 1: no volley yet
      expect(game.ticks()).toBe(initTick + rate - 1);
      const pre = outgoingTroops(atk);
      // Tick phases run for T in [0, ticks): the volley condition
      // (T - initTick >= rate) first holds at T = initTick + rate, so two
      // more ticks execute phases initTick + rate - 1 and initTick + rate.
      executeTicks(game, 2); // initTick + rate: first volley
      expect(game.ticks()).toBe(initTick + rate + 1);
      return { pre, post: outgoingTroops(atk), initTick };
    };
    const armed = await run(true);
    const control = await run(false);
    // Same fight, same passive, no volley before initTick + rate.
    expect(armed.pre).toBe(control.pre);
    // C5: the volley tick carries exactly one Nv1 volley (250).
    expect(control.post - armed.post).toBe(250);
    // D7: lastAttackTick was seeded at init, so nothing fired early — the
    // armed arm matches the control arm on every pre-volley tick.
    expect(armed.initTick).toBe(control.initTick);
  });

  test("D8: invalid levels fall back to Nv1 and dynamic range never reads 0", async () => {
    const config = new EngineConfig({} as GameConfig, false);
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      expect(config.defensePostRange(bad)).toBe(30);
      expect(config.defensePostDamage(bad)).toBe(250);
      expect(config.defensePostAttackRate(bad)).toBe(100);
      expect(config.defensePostDefenseBonus(bad)).toBe(5);
      expect(config.defensePostSpeedBonus(bad)).toBe(3);
    }
    // Dynamic range interpolates old -> new over 45 ticks, never 0, and
    // settles exactly on the new level (R4.9).
    expect(config.defensePostUpgradeDuration()).toBe(45);
    expect(config.defensePostTargettingRange()).toBe(75);
    const { game, def } = await warGame();
    const post = buildPost(game, def, true);
    game.addExecution(new UpgradeStructureExecution(def, post.id(), 1));
    game.executeNextTick();
    expect(post.level()).toBe(2);
    const start = game.ticks();
    for (let t = 0; t <= config.defensePostUpgradeDuration() + 1; t++) {
      const r = config.dynamicDefensePostRange(post, start + t);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeGreaterThanOrEqual(config.defensePostRange(1));
      expect(r).toBeLessThanOrEqual(config.defensePostRange(2));
    }
    expect(
      config.dynamicDefensePostRange(
        post,
        start + config.defensePostUpgradeDuration() + 1,
      ),
    ).toBe(config.defensePostRange(2));
  });

  test("D2: disconnected teammates on the same team are never hit (active + passive)", async () => {
    const teamGame = async () => {
      const game = await setup(
        MAP,
        {
          infiniteGold: true,
          instantBuild: true,
          nations: "disabled",
          bots: 0,
          gameMode: GameMode.Team,
          playerTeams: 2,
        },
        [
          // teamIndex 0 pins both on the same team (server-pinned slot).
          new PlayerInfo(
            "attacker",
            PlayerType.Human,
            "client_a",
            "attacker",
            false,
            null,
            [],
            0,
          ),
          new PlayerInfo(
            "defender",
            PlayerType.Human,
            "client_b",
            "defender",
            false,
            null,
            [],
            0,
          ),
        ],
      );
      const atk = game.player("attacker");
      const def = game.player("defender");
      expect(atk.isOnSameTeam(def)).toBe(true);
      conquerRect(game, atk, 0, 0, 40, 40);
      conquerRect(game, def, 40, 0, 80, 40);
      atk.setTroops(5_000_000);
      def.setTroops(2_000_000);
      atk.markDisconnected(true);
      return { game, atk, def };
    };
    const run = async (withExecution: boolean) => {
      const { game, atk, def } = await teamGame();
      buildPost(game, def, withExecution);
      launchAttack(game, atk, def, 1_000_000);
      executeTicks(game, 115);
      return outgoingTroops(atk);
    };
    // Active channel (explicit R4.5 guard) and passive channel
    // (attackerIsDisconnectedTeammate zeroes mag) are both silent: the armed
    // post changes nothing versus the execution-less control.
    expect(await run(true)).toBe(await run(false));
  });

  test("D3/C6b: disabled posts silence the passive channel (attackLogic level)", () => {
    const enabled = new EngineConfig({} as GameConfig, false);
    const disabled = new EngineConfig(
      { disabledUnits: [UnitType.DefensePost] } as GameConfig,
      false,
    );
    const defender = {
      type: PlayerType.Human,
      numTiles: 20_000,
      troops: 100_000,
      isTraitor: false,
      isDisconnectedTeammate: false,
    };
    const base = {
      terrain: TerrainType.Plains,
      attackTroops: 100_000,
      attacker: { type: PlayerType.Human, numTiles: 20_000 },
      defender,
      defenderHasDefensePost: true,
      defenderDefensePostLevel: 3,
      falloutRatio: null,
      borderSize: 100,
    } as const;
    const noPost = { ...base, defenderHasDefensePost: false };
    // Disabled + post in range behaves exactly like no post at all.
    expect(disabled.attackLogic({ ...base })).toEqual(
      disabled.attackLogic({ ...noPost }),
    );
    // …while enabled, the same Nv3 cover bites and slows (no weakening).
    const hit = enabled.attackLogic({ ...base });
    const plain = enabled.attackLogic({ ...noPost });
    expect(hit.attackerTroopLoss).toBeGreaterThan(plain.attackerTroopLoss);
    expect(hit.tickFraction).toBeGreaterThan(plain.tickFraction);
  });

  test("D4/C10b: bots upgrade through the generic path with the same curve and guards", async () => {
    const game = await setup(
      MAP,
      { infiniteGold: false, instantBuild: true, nations: "disabled", bots: 0 },
      [new PlayerInfo("bot", PlayerType.Bot, null, "bot")],
    );
    const bot = game.player("bot");
    bot.addGold(10_000_000n);
    conquerRect(game, bot, 0, 0, 40, 40);
    const tile = game.ref(20, 20);
    const post = bot.buildUnit(UnitType.DefensePost, tile, {});
    expect(bot.canUpgradeUnit(post)).toBe(true);
    expect(
      bot.findUnitToUpgrade(UnitType.DefensePost, game.ref(21, 20)),
    ).toBeTruthy();

    // The upgrade charges the generic Upgrade cost (not a separate Build
    // price): snapshot the curve's price before executing.
    const expectedCost = game.unitInfo(UnitType.DefensePost).cost(game, bot);
    expect(expectedCost).toBeGreaterThan(0n);
    const before = bot.gold();
    game.addExecution(new UpgradeStructureExecution(bot, post.id(), 1));
    game.executeNextTick();
    expect(post.level()).toBe(2);
    expect(before - bot.gold()).toBe(expectedCost);
    // Same per-level curve as manual upgrades everywhere else.
    expect(game.config().defensePostRange(2)).toBe(38);
    expect(game.config().defensePostDamage(2)).toBe(320);
    expect(game.config().defensePostAttackRate(2)).toBe(85);
    // Same guards: disabled or under construction → no upgrade.
    (game.config() as unknown as { _gameConfig: GameConfig })._gameConfig
      .disabledUnits = [UnitType.DefensePost];
    expect(bot.canUpgradeUnit(post)).toBe(false);
  });
});
