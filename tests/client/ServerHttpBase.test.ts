import { describe, expect, it } from "vitest";
import {
  deriveServerHttpBase,
  deriveServerWsBase,
} from "../../src/client/ClientEnv";

// deriveServerHttpBase resolves the origin of the game server's *HTTP* API --
// the worker routes under /api (create_game, game/:id, game/:id/exists,
// game/:id/listing). It is the sibling of deriveServerWsBase: the two must
// always name the same server, because a lobby created on one host is only
// reachable over the socket on that same host.
//
// Local-only build (docs/LocalMode.md R1): one origin serves the page, the API
// and the socket, so both helpers answer with it.

describe("deriveServerHttpBase", () => {
  describe("web build (no injected serverHost) stays same-origin", () => {
    it("uses the document origin on https", () => {
      expect(deriveServerHttpBase(undefined, "https:", "openfront.io")).toBe(
        "https://openfront.io",
      );
    });

    it("uses the document origin on http (local dev keeps the port)", () => {
      expect(deriveServerHttpBase(undefined, "http:", "localhost:3000")).toBe(
        "http://localhost:3000",
      );
    });

    it("preserves the exact location.host (e.g. www vs apex)", () => {
      expect(
        deriveServerHttpBase(undefined, "https:", "www.openfront.io"),
      ).toBe("https://www.openfront.io");
    });

    it("treats an empty serverHost as absent (web fallback)", () => {
      expect(deriveServerHttpBase("", "https:", "openfront.io")).toBe(
        "https://openfront.io",
      );
    });
  });

  // The invariant that matters once the client picks a server at runtime (the
  // planned /cluster.json lookup): whatever decides the host must move both
  // bases together, or lobbies get created on one server and played on another.
  describe("stays in lockstep with deriveServerWsBase", () => {
    it.each([
      [undefined, "https:", "openfront.io"],
      [undefined, "http:", "localhost:3000"],
      ["openfront.io", "app:", "openfront"],
      ["main.openfront.dev", "app:", "openfront"],
    ] as const)(
      "names the same host for (%s, %s, %s)",
      (serverHost, protocol, host) => {
        const http = new URL(deriveServerHttpBase(serverHost, protocol, host));
        const ws = new URL(deriveServerWsBase(serverHost, protocol, host));
        expect(http.host).toBe(ws.host);
        // ...and the same transport security, so an https page never talks to
        // a ws:// game server (mixed content) or vice versa.
        expect(http.protocol === "https:").toBe(ws.protocol === "wss:");
      },
    );
  });
});
