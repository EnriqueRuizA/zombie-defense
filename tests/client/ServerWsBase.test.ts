import { describe, expect, it } from "vitest";
import { deriveServerWsBase } from "../../src/client/ClientEnv";

// deriveServerWsBase resolves the game-server WebSocket origin used by both the
// public-lobby socket (LobbySocket) and the in-game socket (Transport).
//
// Local-only build (docs/LocalMode.md R1): there is no injected serverHost and
// no desktop shell -- every client derives scheme + host from window.location,
// so the game server is always this page's own origin.
describe("deriveServerWsBase", () => {
  describe("web build (no injected serverHost) is unchanged", () => {
    it("uses same-origin wss on https", () => {
      expect(deriveServerWsBase(undefined, "https:", "openfront.io")).toBe(
        "wss://openfront.io",
      );
    });

    it("uses same-origin ws on http (local dev falls back to location.host)", () => {
      expect(deriveServerWsBase(undefined, "http:", "localhost:3000")).toBe(
        "ws://localhost:3000",
      );
    });

    it("preserves the exact location.host (e.g. www vs apex)", () => {
      expect(deriveServerWsBase(undefined, "https:", "www.openfront.io")).toBe(
        "wss://www.openfront.io",
      );
    });

    it("treats an empty serverHost as absent (web fallback)", () => {
      expect(deriveServerWsBase("", "https:", "openfront.io")).toBe(
        "wss://openfront.io",
      );
    });
  });
});
