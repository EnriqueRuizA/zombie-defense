import {
  Duos,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  Quads,
} from "@zombie-defense/engine-api/game/GameTypes";
import { GameConfig } from "@zombie-defense/engine-api/Schemas";
import { PublicGameInfo } from "@zombie-defense/shared/WireSchemas";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  filterAndSortLobbies,
  flattenLobbies,
  lobbyFacts,
  LobbyFilters,
  normalizeFilters,
} from "../../src/client/components/DetailedGameViewFilters";

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    gameMap: GameMapType.World,
    gameType: GameType.Public,
    gameMode: GameMode.FFA,
    difficulty: "Medium",
    gameMapSize: "Medium",
    donateGold: true,
    donateTroops: true,
    nations: "default",
    bots: 400,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    maxPlayers: 100,
    ...overrides,
  } as GameConfig;
}

function lobby(overrides: Partial<PublicGameInfo> = {}): PublicGameInfo {
  return {
    gameID: "a",
    numClients: 10,
    publicGameType: "ffa",
    gameConfig: config(),
    ...overrides,
  } as PublicGameInfo;
}

function filters(overrides: Partial<LobbyFilters> = {}): LobbyFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("lobbyFacts", () => {
  it("reports FFA lobbies with no team layout", () => {
    const facts = lobbyFacts(lobby());
    expect(facts.mode).toBe("ffa");
    expect(facts.source).toBe("public");
    expect(facts.teamConfig).toBeNull();
    expect(facts.teamSize).toBeNull();
  });

  it("derives team count from a named team format", () => {
    const facts = lobbyFacts(
      lobby({
        publicGameType: "team",
        gameConfig: config({
          gameMode: GameMode.Team,
          playerTeams: Quads,
          maxPlayers: 50,
        }),
      }),
    );
    expect(facts.mode).toBe("teams");
    expect(facts.teamConfig).toBe(Quads);
    expect(facts.teamSize).toBe(4);
    expect(facts.teamCount).toBe(12);
  });

  it("derives team size from a numeric team count", () => {
    const facts = lobbyFacts(
      lobby({
        gameConfig: config({
          gameMode: GameMode.Team,
          playerTeams: 5,
          maxPlayers: 100,
        }),
      }),
    );
    expect(facts.teamConfig).toBe("5");
    expect(facts.teamCount).toBe(5);
    expect(facts.teamSize).toBe(20);
  });

  it("treats humans vs nations as its own mode", () => {
    const facts = lobbyFacts(
      lobby({
        gameConfig: config({
          gameMode: GameMode.Team,
          playerTeams: HumansVsNations,
        }),
      }),
    );
    expect(facts.mode).toBe("hvn");
    expect(facts.teamConfig).toBeNull();
  });

  it("marks listed private lobbies as hosted", () => {
    expect(lobbyFacts(lobby({ publicGameType: "hosted" })).source).toBe(
      "hosted",
    );
  });
});

describe("flattenLobbies", () => {
  it("returns every bucket's lobbies", () => {
    const games = {
      ffa: [lobby({ gameID: "a" })],
      team: [lobby({ gameID: "b" }), lobby({ gameID: "c" })],
      hosted: [],
    };
    expect(flattenLobbies(games).map((l) => l.gameID)).toEqual(["a", "b", "c"]);
  });

  it("handles a missing games record", () => {
    expect(flattenLobbies(undefined)).toEqual([]);
  });
});

describe("filterAndSortLobbies", () => {
  const ffa = lobby({ gameID: "ffa1", numClients: 5, startsAt: 300 });
  const teams = lobby({
    gameID: "team1",
    publicGameType: "team",
    numClients: 0,
    startsAt: 100,
    gameConfig: config({
      gameMode: GameMode.Team,
      playerTeams: Duos,
      maxPlayers: 40,
    }),
  });
  const hosted = lobby({
    gameID: "hosted1",
    publicGameType: "hosted",
    numClients: 2,
    startsAt: undefined,
    gameConfig: config({ maxPlayers: 20 }),
  });
  const all = [ffa, teams, hosted];

  it("keeps everything by default", () => {
    expect(filterAndSortLobbies(all, filters())).toHaveLength(3);
  });

  it("orders by soonest countdown, with startless lobbies last", () => {
    const sorted = filterAndSortLobbies(all, filters());
    expect(sorted.map((l) => l.gameID)).toEqual(["team1", "ffa1", "hosted1"]);
  });

  it("keeps the server's queue order for lobbies with no countdown", () => {
    // Ids are deliberately out of alphabetical order: the queue is whatever
    // order the server sent, not something the client re-derives.
    const queued = ["zulu", "alpha", "mike"].map((gameID) =>
      lobby({ gameID, startsAt: undefined }),
    );
    const sorted = filterAndSortLobbies([ffa, ...queued], filters());
    expect(sorted.map((l) => l.gameID)).toEqual([
      "ffa1",
      "zulu",
      "alpha",
      "mike",
    ]);
  });

  it("filters by mode", () => {
    expect(
      filterAndSortLobbies(all, filters({ modes: ["teams"] })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["team1"]);
  });

  it("filters by source", () => {
    expect(
      filterAndSortLobbies(all, filters({ sources: ["hosted"] })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["hosted1"]);
  });

  it("filters by team layout, excluding lobbies without one", () => {
    expect(
      filterAndSortLobbies(all, filters({ teamConfigs: [Duos] })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["team1"]);
  });

  it("hides empty lobbies when asked", () => {
    expect(
      filterAndSortLobbies(all, filters({ hideEmpty: true })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["ffa1", "hosted1"]);
  });

  it("applies joined-player bounds", () => {
    expect(
      filterAndSortLobbies(all, filters({ minJoined: 2, maxJoined: 4 })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["hosted1"]);
  });

  it("applies capacity bounds", () => {
    expect(
      filterAndSortLobbies(all, filters({ maxCapacity: 40 })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["team1", "hosted1"]);
  });

  it("applies team-size bounds, excluding lobbies with no teams", () => {
    expect(
      filterAndSortLobbies(all, filters({ minTeamSize: 2 })).map(
        (l) => l.gameID,
      ),
    ).toEqual(["team1"]);
  });
});

describe("normalizeFilters", () => {
  it("falls back to defaults for junk input", () => {
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters("nope")).toEqual(DEFAULT_FILTERS);
  });

  it("drops unknown values and negative bounds", () => {
    const normalized = normalizeFilters({
      modes: ["ffa", "nope", "ffa"],
      sources: "not-an-array",
      teamConfigs: ["Duos", "99"],
      hideEmpty: "yes",
      minJoined: -5,
      maxJoined: 12.7,
      sort: "bogus",
    });
    expect(normalized.modes).toEqual(["ffa"]);
    expect(normalized.sources).toEqual([]);
    expect(normalized.teamConfigs).toEqual([Duos]);
    expect(normalized.hideEmpty).toBe(false);
    expect(normalized.minJoined).toBeNull();
    expect(normalized.maxJoined).toBe(12);
    // A stored profile from an older build can carry fields the filter set no
    // longer has; they're dropped rather than copied through.
    expect("sort" in normalized).toBe(false);
  });
});
