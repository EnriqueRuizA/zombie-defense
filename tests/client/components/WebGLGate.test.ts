import { afterEach, describe, expect, it } from "vitest";
import {
  WebGLGate,
  type WebGLGateStatus,
} from "../../../src/client/components/WebGLGate";

// Local-only build (docs/LocalMode.md R2): the gate is web-only. Every status
// gives the player browser instructions; the desktop shell, its quit button
// and its en.json-only copy are gone with it.
describe("webgl-gate", () => {
  let gate: WebGLGate | undefined;

  afterEach(() => {
    gate?.remove();
  });

  async function mount(status: WebGLGateStatus): Promise<WebGLGate> {
    gate = new WebGLGate();
    gate.status = status;
    document.body.appendChild(gate);
    await gate.updateComplete;
    return gate;
  }

  it.each<WebGLGateStatus>(["unsupported", "software"])(
    "shows browser instructions for %s",
    async (status) => {
      await mount(status);

      expect(gate!.textContent).toContain("Google Chrome");
      expect(gate!.textContent).not.toContain("desktop_webgl_gate");
      expect(gate!.textContent).not.toContain("chrome://flags|Safari");
    },
  );

  it("keeps the fingerprinting warning when the browser limits WebGL", async () => {
    await mount("limited");

    expect(gate!.textContent).toContain("Your browser is limiting WebGL");
  });
});
