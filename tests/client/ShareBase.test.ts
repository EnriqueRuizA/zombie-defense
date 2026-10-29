import { describe, expect, it, vi } from "vitest";
import {
  ClientEnv,
  deriveShareBase,
  deriveShareOrigin,
} from "../../src/client/ClientEnv";
import { playerProfileUrl } from "../../src/client/utilities/PlayerProfileUrl";

// These two answer "where should a link that LEAVES this client point?" — the
// lobby invite a host copies, the game link in a history row, the profile link
// a player sends a friend, the domain the magic-link email comes back to.
//
// Local-only build (docs/LocalMode.md R1): the answer is always the document
// itself -- there is no desktop shell whose app:// origin a link could escape.

/** What ClientEnv reads out of BOOTSTRAP_CONFIG, as the helpers take it. */
function bootstrap(siteOrigin?: string, jwtAudience = "openfront.io") {
  return () => ({ siteOrigin, jwtAudience });
}

/** A bootstrap that fails the test if the helper reads it at all. */
const forbidden = () => {
  throw new Error("BOOTSTRAP_CONFIG must not be required on the web path");
};

describe("deriveShareOrigin", () => {
  describe("web build: the document's own origin is shareable", () => {
    it("uses the document origin on https", () => {
      expect(
        deriveShareOrigin(bootstrap(), "https:", "https://openfront.io"),
      ).toBe("https://openfront.io");
    });

    it("keeps the port on local dev over http", () => {
      expect(
        deriveShareOrigin(bootstrap(), "http:", "http://localhost:9000"),
      ).toBe("http://localhost:9000");
    });

    it("never reads BOOTSTRAP_CONFIG on the web path", () => {
      // A plain web page — and a jsdom test rendering a copy button — must not
      // start requiring the bootstrap just to build a link to itself.
      expect(
        deriveShareOrigin(forbidden, "https:", "https://openfront.io"),
      ).toBe("https://openfront.io");
    });

    it("ignores an injected site host while the document is already on the web", () => {
      // A desktop build pointed at a dev server (OPENFRONT_DEV_URL) loads over
      // http; its own origin is shareable, so nothing should redirect it.
      expect(
        deriveShareOrigin(
          bootstrap("https://openfront.io"),
          "http:",
          "http://localhost:9000",
        ),
      ).toBe("http://localhost:9000");
    });
  });
});

describe("deriveShareBase", () => {
  it("keeps the current path on the web, so a link copied from /c/CODE stays there", () => {
    expect(
      deriveShareBase(bootstrap(), "https:", "https://openfront.io", "/c/abc"),
    ).toBe("https://openfront.io/c/abc");
  });
});

describe("playerProfileUrl", () => {
  it("is the site's /player/<id> path off the share origin, not off window.location", () => {
    const shareOrigin = vi
      .spyOn(ClientEnv, "shareOrigin")
      .mockReturnValue("https://openfront.io");
    try {
      expect(playerProfileUrl("aB3dE5fX")).toBe(
        "https://openfront.io/player/aB3dE5fX",
      );
      expect(playerProfileUrl("a+b")).toBe("https://openfront.io/player/a%2Bb");
    } finally {
      shareOrigin.mockRestore();
    }
  });

  it("drops the page's own path (a link copied from /c/CODE is still the profile)", () => {
    history.replaceState(null, "", "/c/abc");
    try {
      expect(playerProfileUrl("aB3dE5fX")).toBe(
        `${window.location.origin}/player/aB3dE5fX`,
      );
    } finally {
      history.replaceState(null, "", "/");
    }
  });
});
