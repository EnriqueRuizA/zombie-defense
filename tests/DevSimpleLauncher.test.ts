import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// Static contract for the v1.3 Windows launcher (scripts/dev-simple.ps1).
// PowerShell/MSI/UAC cannot run on CI (Linux), so this test asserts the
// script text keeps the approved v1.3 decisions: dynamic Node 24 resolution
// from https://nodejs.org/dist (no hardcoded MSI URL/hash), the msiexec
// template, the S/N prompt defaulting to Yes, PATH refresh + where.exe,
// TEMP logging, the step order, and the ERROR+Accion+pause+exit!=0 abort.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PS1 = fs.readFileSync(
  path.join(ROOT, "scripts", "dev-simple.ps1"),
  "utf8",
);

describe("dev-simple.ps1 v1.3 launcher contract", () => {
  it("resolves Node 24 dynamically: dist base + index.json + SHASUMS, no hardcoded MSI URL/hash", () => {
    expect(PS1).toContain("https://nodejs.org/dist");
    expect(PS1).toContain("index.json");
    expect(PS1).toContain("SHASUMS256.txt");
    // No versioned dist URL, no MSI filename with a version, no SHA256 hex.
    expect(PS1).not.toMatch(/nodejs\.org\/dist\/v\d/);
    expect(PS1).not.toMatch(/node-v\d+\.\d+\.\d+-x64\.msi/);
    expect(PS1).not.toMatch(/[0-9a-f]{64}/i);
  });

  it("installs with the msiexec /i /qn /norestart /log template", () => {
    expect(PS1).toContain("msiexec");
    expect(PS1).toContain("/qn");
    expect(PS1).toContain("/norestart");
    expect(PS1).toContain("/log");
    expect(PS1).toMatch(/msiexec\s+\/i/);
  });

  it("asks S/N defaulting to Yes before any Node download", () => {
    expect(PS1).toContain("[S/n]");
    expect(PS1).toContain("Read-Host");
  });

  it("refreshes the session PATH and reports coexistence via where.exe", () => {
    expect(PS1).toContain("where.exe");
    expect(PS1).toContain("GetEnvironmentVariable");
    expect(PS1).toContain("$env:TEMP");
    expect(PS1).toContain("node-install.log");
  });

  it("aborts with ERROR + Accion + pause + non-zero exit", () => {
    expect(PS1).toContain("ERROR:");
    expect(PS1).toContain("Accion:");
    expect(PS1).toContain('Read-Host "Pulsa Enter para cerrar"');
    expect(PS1).toContain("exit 1");
  });

  it("keeps the step order: Node auto -> re-check -> npm auto -> deps -> ports (explicit server.port) -> dev -> browser", () => {
    const nodeAuto = PS1.indexOf("Install-NodeAuto");
    const npmAuto = PS1.indexOf("npm install --global --ignore-scripts");
    const deps = PS1.indexOf("2/4 Comprobando dependencias");
    const ports = PS1.indexOf("3/4 Comprobando puertos");
    const serverPort = PS1.indexOf("server.port");
    // First "npm run dev" AFTER the ports block = the real 4/4 start.
    const dev = PS1.indexOf("npm run dev", ports);
    const browser = PS1.indexOf("Start-Process");
    for (const idx of [
      nodeAuto,
      npmAuto,
      deps,
      ports,
      serverPort,
      dev,
      browser,
    ]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(nodeAuto).toBeLessThan(npmAuto);
    expect(npmAuto).toBeLessThan(deps);
    expect(deps).toBeLessThan(ports);
    expect(ports).toBeLessThan(dev);
    expect(dev).toBeLessThan(browser);
  });

  it("uses -LiteralPath for paths with spaces", () => {
    expect(PS1).toContain("Test-Path -LiteralPath");
    expect(PS1).toContain("Get-Content -LiteralPath");
    expect(PS1).toContain("Get-FileHash -LiteralPath");
    expect(PS1).toContain("Remove-Item -LiteralPath");
  });

  it("mentions winget only as an out-of-scope Propuesta comment", () => {
    const lines = PS1.split(/\r?\n/);
    const wingetLines = lines.filter((l) => /winget/i.test(l));
    expect(wingetLines.length).toBeGreaterThan(0);
    for (const line of wingetLines) {
      expect(line.trimStart().startsWith("#")).toBe(true);
    }
  });
});
