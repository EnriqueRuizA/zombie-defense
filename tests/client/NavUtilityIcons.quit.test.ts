import { beforeEach, describe, expect, it } from "vitest";

import "../../src/client/components/NavUtilityIcons";

type Mountable = HTMLElement & { updateComplete: Promise<unknown> };

async function mount(): Promise<Mountable> {
  const el = document.createElement("nav-utility-icons") as Mountable;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function quitButton(el: ParentNode): HTMLButtonElement | null {
  return el.querySelector('[data-i18n-aria-label="main.quit"]');
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.currentPageId = "page-play";
});

// Local-only build (docs/LocalMode.md R2): the desktop shell and its power
// button are gone, so there is no exit door beside the cog. Pinned so the
// icon cannot come back without the shell it belongs to.
describe("the nav's exit door", () => {
  it("is absent: there is no desktop shell to quit to", async () => {
    const el = await mount();
    expect(quitButton(el)).toBeNull();
  });

  it("offers only the help and settings page buttons", async () => {
    const el = await mount();
    const pageButtons = Array.from(
      el.querySelectorAll<HTMLElement>(".nav-menu-item[data-page]"),
    ).map((b) => b.dataset.page);
    expect(pageButtons).toEqual(["page-help", "page-settings"]);
  });
});
