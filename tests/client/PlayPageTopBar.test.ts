import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zombie-defense/shared/AssetUrls", () => ({
  assetUrl: (path: string) => path,
}));

// Rendering play-page mounts its children too, and some reach for browser
// APIs jsdom doesn't ship.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { PlayPage } from "../../src/client/components/PlayPage";

// Local-only build (docs/LocalMode.md): no news bell, no account menu, no
// platform SDK -- the mobile top bar's right slot is the utility cluster and
// nothing else. The local nick lives in the identity row below it.
describe("play-page mobile top bar", () => {
  let el: PlayPage;

  async function mount() {
    if (!customElements.get("play-page")) {
      customElements.define("play-page", PlayPage);
    }
    el = document.createElement("play-page") as PlayPage;
    document.body.appendChild(el);
    await el.updateComplete;
  }

  beforeEach(mount);

  afterEach(() => {
    el?.remove();
    vi.clearAllMocks();
  });

  const rightSlot = () =>
    Array.from(el.querySelector(".col-start-3")!.children).map((c) =>
      c.tagName.toLowerCase(),
    );

  it("puts the utility icons in the right slot, with no account menu", () => {
    expect(rightSlot()).toEqual(["nav-utility-icons"]);
  });

  it("renders the same controls on every platform", () => {
    // clientPlatform() is always "web" in this build, so there is no
    // platform-specific branch to diverge: the slot reads the same for all.
    expect(rightSlot()).toEqual(["nav-utility-icons"]);
  });
});
