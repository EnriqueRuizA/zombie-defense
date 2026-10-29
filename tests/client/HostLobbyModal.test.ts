import { render } from "lit";
import { describe, expect, it } from "vitest";

import { HostLobbyModal } from "../../src/client/HostLobbyModal";

// Local-only build (docs/LocalMode.md R2/R6): there is no desktop shell and
// no Steam overlay, so the header carries the copy button and nothing else.
// The invite button, its presence bridge and the shell it lived in are gone.
describe("HostLobbyModal header", () => {
  const INVITE = "[data-test-invite-friends]";
  const COPY = "copy-button";

  function renderHeader(modal: HostLobbyModal): HTMLElement {
    const container = document.createElement("div");
    render(
      (modal as unknown as { renderHeaderSlot(): unknown }).renderHeaderSlot() as never,
      container,
    );
    return container;
  }

  function hostModal(): HostLobbyModal {
    const modal = new HostLobbyModal();
    (modal as unknown as { lobbyId: string }).lobbyId = "ABCD1234";
    return modal;
  }

  it("leaves the copy button alone", () => {
    const header = renderHeader(hostModal());

    expect(header.querySelector(INVITE)).toBeNull();
    expect(header.querySelector(COPY)).not.toBeNull();
  });

  it("offers no invite button, on any surface", () => {
    const modal = new HostLobbyModal();

    expect(renderHeader(modal).querySelector(INVITE)).toBeNull();
  });
});
