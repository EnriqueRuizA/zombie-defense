import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearAppShellContentCache,
  getAppShellContent,
} from "../../src/server/RenderHtml";

describe("RenderHtml (local-only)", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    clearAppShellContentCache();

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test("reuses cached app shell content", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "render-html-"));
    const htmlPath = path.join(tempDir, "index.html");
    await fs.writeFile(
      htmlPath,
      "<script>window.GIT_COMMIT = <%- gitCommit %>;</script>",
      "utf8",
    );

    process.env.GIT_COMMIT = "first";
    const first = await getAppShellContent(htmlPath);

    process.env.GIT_COMMIT = "second";
    const second = await getAppShellContent(htmlPath);

    expect(first).toContain('"first"');
    expect(second).toBe(first);
    expect(second).not.toContain('"second"');
  });

  test("injects only local, same-origin bootstrap values", async () => {
    vi.stubEnv("NUM_WORKERS", "1");
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "render-html-"));
    const htmlPath = path.join(tempDir, "index.html");
    await fs.writeFile(
      htmlPath,
      [
        "cluster: <%- cluster %>",
        "instanceLetter: <%- instanceLetter %>",
        "casualMode: <%- casualMode %>",
        "jwtAudience: <%- jwtAudience %>",
        'cdnBase: "<%- cdnBaseRaw %>"',
      ].join("\n"),
      "utf8",
    );

    const rendered = await getAppShellContent(htmlPath);

    expect(rendered).toContain('instanceLetter: "a"');
    expect(rendered).toContain('"host":"localhost"');
    expect(rendered).toContain("casualMode: true");
    expect(rendered).toContain('jwtAudience: "localhost"');
    expect(rendered).toContain('cdnBase: ""');
  });
});
