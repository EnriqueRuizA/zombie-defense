import { beforeEach, describe, expect, it } from "vitest";
import { modalRouter } from "../../src/client/ModalRouter";
import "../../src/client/UserSettingModal";
import type { UserSettingModal } from "../../src/client/UserSettingModal";

type TestModal = UserSettingModal & { updateComplete: Promise<unknown> };

// O1 removed the "evan" key-sequence easter egg: the Gameplay tab must no
// longer render secret controls. Mount the tab normally (no unlock flag).
async function mountGameplay(): Promise<TestModal> {
  const el = document.createElement("user-setting") as TestModal;
  document.body.appendChild(el);
  await el.updateComplete;
  el.open({ tab: "gameplay" });
  await el.updateComplete;
  return el;
}

describe("user-setting gameplay tab (no easter eggs)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    location.hash = "";
    // Main.ts registers this at boot; the URL sync is a no-op without it.
    modalRouter.register("settings", {
      tag: "user-setting",
      pageId: "page-settings",
    });
  });

  it("renders no secret easter-egg controls", async () => {
    const el = await mountGameplay();

    expect(el.querySelector("setting-slider[easter]")).toBeNull();
    expect(el.querySelector("setting-number[easter]")).toBeNull();
  });

  it("keeps the normal gameplay settings intact", async () => {
    const el = await mountGameplay();

    // Regular (non-secret) gameplay controls still render.
    expect(el.querySelector("setting-slider:not([easter])")).not.toBeNull();
  });
});
