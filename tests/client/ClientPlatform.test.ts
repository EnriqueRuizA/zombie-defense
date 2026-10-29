import { describe, expect, it } from "vitest";
import { clientPlatform } from "../../src/client/ClientPlatform";

// Local-only build (docs/LocalMode.md): no desktop shell and no game portal,
// so every client is the plain web build whatever frame it sits in. Pinned so
// platform-specific branches cannot come back unnoticed.
describe("clientPlatform", () => {
  it("is web by default", () => {
    expect(clientPlatform()).toBe("web");
  });

  it("is web in any frame", () => {
    expect(clientPlatform()).toBe("web");
  });

  it("never reports a portal or shell platform", () => {
    expect(clientPlatform()).not.toBe("crazygames");
    expect(clientPlatform()).not.toBe("poki");
    expect(clientPlatform()).not.toBe("steam");
  });
});
