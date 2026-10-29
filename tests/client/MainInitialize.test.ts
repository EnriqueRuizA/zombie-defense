/**
 * First harness that imports src/client/Main.ts for real. Main bootstraps at
 * module scope (`new Client().initialize()`), so the DOM (built from the real
 * index.html body) and every global it dereferences must exist BEFORE the
 * dynamic import in beforeAll. All tests share that one boot: custom elements
 * cannot be re-defined in the file's single jsdom, so a second import of Main
 * (after vi.resetModules) would throw on the first `customElements.define`.
 *
 * Local-only build (docs/LocalMode.md): no Api, no ads, no desktop session
 * retry, no matchmaking modal and no replay viewer — the boot asserts are the
 * local ones: identity seeding, the local lobby modals and the join funnel
 * down to `joinLobby`.
 */
import { EventBus } from "@zombie-defense/shared/EventBus";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadModal } from "../../src/client/LazyModals";
import { SendKickPlayerIntentEvent } from "../../src/client/LobbyEvents";
import { capturePagePin } from "../../src/client/PagePin";

const mocks = vi.hoisted(() => ({
  joinLobby: vi.fn(),
}));

// Deterministic "version element not found" (Main.ts line 214) regardless of
// whether the Lit nav bars have rendered their version spans yet. It doubles
// as this suite's readiness signal for initialize().
vi.mock("../../src/client/GameVersion", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, renderNavVersion: () => 0 };
});

// Cuts the whole Pixi/WebGL/worker/audio in-game graph out of the import.
// Transport/LocalServer only take the LobbyConfig *type* from this module,
// so a value-only stub is safe.
vi.mock("../../src/client/ClientGameRunner", () => ({
  joinLobby: mocks.joinLobby,
}));

describe("Client.initialize() booted from Main.ts module scope", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // A local page still carries the bootstrap: workers and the commit it was
    // built from. Nothing here names a server or an audience (R1/R2).
    (window as any).BOOTSTRAP_CONFIG = {
      gameEnv: "dev",
      numWorkers: 2,
      gitCommit: "DEV",
    };

    // jsdom has neither FontFace nor document.fonts.
    vi.stubGlobal(
      "FontFace",
      class {
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      value: { add: () => {} },
      configurable: true,
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    // Components in Main's graph fire fetches from connectedCallback; answer
    // them all with a failure they already handle instead of real sockets.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Server Error",
        headers: new Map<string, string>(),
        json: async () => ({}),
        text: async () => "",
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    // Real markup, so every unguarded getElementById/querySelector in
    // initialize() (store modal, help modal, turnstile container, ...) finds
    // the element it dereferences. Scripts hold EJS placeholders — drop them.
    const html = fs.readFileSync(
      path.resolve(__dirname, "../../index.html"),
      "utf8",
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    parsed.querySelectorAll("script").forEach((s) => s.remove());
    const bodyInner = parsed.body.innerHTML;
    // A guaranteed-first <username-input> so Client.initialize() captures an
    // element we can stub canPlay() on (play-page renders its own copy async,
    // maybe, later — document order keeps ours the querySelector result).
    document.body.innerHTML = `<username-input></username-input>${bodyInner}`;

    localStorage.setItem(
      "achievements.pushed",
      JSON.stringify({ playerId: "p1", names: ["win_ffa"] }),
    );

    // The import runs bootstrap: component registration, element upgrades,
    // then `new Client().initialize()`.
    await import("../../src/client/Main");

    if (document.readyState === "loading") {
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
    }

    // initialize() passes the version span at a fixed point and the
    // join-lobby listener is wired a handful of statements later; waiting for
    // that warn plus a macrotask puts every listener this file drives in
    // place.
    await vi.waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith("Game version element not found"),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }, 20_000);

  // Returning to page-play schedules Main's 50ms store refresh. Let it run
  // before jsdom is torn down, or it throws "customElements is not defined"
  // as an unhandled error that fails the whole run.
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("runs the boot: the missing-version warn fires", () => {
    // renderNavVersion() === 0 branch (Main.ts line 213).
    expect(warnSpy).toHaveBeenCalledWith("Game version element not found");
  });

  it("clears the stale achievements.pushed record", () => {
    expect(localStorage.getItem("achievements.pushed")).toBeNull();
  });

  it("starts the menu audio once its chunk loads", async () => {
    // Its own chunk, so the page doesn't wait on howler.
    const { audioMixer } = await import("../../src/client/sound/AudioMixer");
    await vi.waitFor(() => expect(audioMixer()).not.toBeNull());
  });

  it("hands the lobby modals the event bus before a loader can open them", async () => {
    const seen: unknown[] = [];
    for (const tag of ["host-lobby-modal", "join-lobby-modal"]) {
      await loadModal(tag);
      // Read as soon as loadModal settles: what an opener would find.
      seen.push(
        (document.querySelector(tag) as unknown as { eventBus: unknown })
          .eventBus,
      );
    }
    expect(seen.every((bus) => bus instanceof EventBus)).toBe(true);
  });

  it("routes a hashchange through onHashUpdate", async () => {
    // It loads on demand; until it has, there's nothing to close.
    await loadModal("join-lobby-modal");
    const joinModal = document.querySelector("join-lobby-modal") as unknown as {
      close: () => void;
    };
    const closeSpy = vi.spyOn(joinModal, "close").mockImplementation(() => {});
    window.dispatchEvent(new Event("hashchange"));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
    closeSpy.mockRestore();
  });

  it("reads the join-lobby detail and stops at the username gate", async () => {
    const input = document.querySelector("username-input") as unknown as {
      canPlay: () => boolean;
    };
    const canPlay = vi.fn(() => false);
    input.canPlay = canPlay;
    document.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: { gameID: "AbCd1234" },
        bubbles: true,
      }),
    );
    await vi.waitFor(() => expect(canPlay).toHaveBeenCalled());
    // Early return before the "joining lobby" log — nothing joined.
    expect(
      vi.mocked(console.log).mock.calls.some(([m]) =>
        String(m).includes("joining lobby"),
      ),
    ).toBe(false);
    expect(mocks.joinLobby).not.toHaveBeenCalled();
  });

  it("forwards a kick-player DOM event to the game event bus", () => {
    const emitSpy = vi.spyOn(EventBus.prototype, "emit");
    document.dispatchEvent(
      new CustomEvent("kick-player", {
        detail: { target: "c0000002" },
        bubbles: true,
      }),
    );
    expect(
      emitSpy.mock.calls.some(
        ([e]) =>
          e instanceof SendKickPlayerIntentEvent && e.target === "c0000002",
      ),
    ).toBe(true);
    emitSpy.mockRestore();
  });

  // The two halves of the share/in-game URL rule in one test. The in-game
  // `?live` entry is this tab's OWN URL, so on a page pinned under
  // /v/<commit>/ it carries that prefix: an F5 must reload the bundle this
  // page is running, not hand a mid-game player `latest`. The share rewrite
  // is the opposite -- it is what people copy out of the address bar, so it
  // stays version-free and the recipient is routed by the game's own server.
  //
  // Driven end-to-end through the real join path: the share rewrite runs
  // first, the `?live` entry when the join handle resolves.
  it("pins the in-game URL but not the share URL on a /v/<commit>/ page", async () => {
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      value: {
        href: "http://localhost:3000/v/5ccc50a7/",
        origin: "http://localhost:3000",
        host: "localhost:3000",
        hostname: "localhost",
        pathname: "/v/5ccc50a7/",
        search: "",
        hash: "",
      },
      writable: true,
      configurable: true,
    });
    // Client.initialize() takes the pin as its very first act (PagePin.ts),
    // and this suite boots Main once in beforeAll, before the stub above.
    // Re-taking it here is what a genuinely pinned document would have done
    // -- and it is the whole point: from here on the answer no longer moves
    // when the share rewrite takes the prefix out of the address bar.
    capturePagePin();
    const replaceSpy = vi
      .spyOn(history, "replaceState")
      .mockImplementation(() => {});
    const pushSpy = vi.spyOn(history, "pushState").mockImplementation(() => {});
    let resolveJoin: () => void = () => {};
    mocks.joinLobby.mockReturnValueOnce({
      // Never resolves: the prestart branch is a different story, and this
      // test is about the two URL writes.
      prestart: new Promise<void>(() => {}),
      join: new Promise<void>((resolve) => {
        resolveJoin = resolve;
      }),
      stop: () => true,
    });
    const input = document.querySelector("username-input") as unknown as {
      canPlay: () => boolean;
    };
    input.canPlay = () => true;

    try {
      document.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: { gameID: "dAbCd12345", source: "private" },
          bubbles: true,
        }),
      );

      // The share-URL rewrite is deliberately NOT pinned: it is the URL
      // people copy out of the address bar, and a recipient must be routed
      // to the same origin's own join flow when they open it.
      await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalled());
      const calls = replaceSpy.mock.calls;
      const rewritten = calls[calls.length - 1][2] as string;
      // Shape-matched rather than just "not pinned", so this cannot pass by
      // catching some other replaceState.
      expect(rewritten).toMatch(
        /^(\/streamer-mode|\/(w\d+\/)?game\/dAbCd12345)$/,
      );

      // And the in-game entry once the join lands.
      await vi.waitFor(() => expect(mocks.joinLobby).toHaveBeenCalled());
      resolveJoin();
      await vi.waitFor(() =>
        expect(
          pushSpy.mock.calls.some((c) =>
            (c[2] as string)?.startsWith("/v/5ccc50a7/"),
          ),
        ).toBe(true),
      );
    } finally {
      replaceSpy.mockRestore();
      pushSpy.mockRestore();
      Object.defineProperty(window, "location", {
        value: realLocation,
        writable: true,
        configurable: true,
      });
    }
  }, 15_000);
});
