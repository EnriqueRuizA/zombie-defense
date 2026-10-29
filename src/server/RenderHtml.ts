import { buildAssetUrl } from "@zombie-defense/shared/AssetPaths";
import ejs from "ejs";
import type { Response } from "express";
import fs from "fs/promises";
import { setNoStoreHeaders } from "./NoStoreHeaders";
import { getRuntimeAssetManifest } from "./RuntimeAssetManifest";
import { ServerEnv } from "./ServerEnv";

const APP_SHELL_CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=86400, stale-if-error=86400";

const appShellContentCache = new Map<string, Promise<string>>();

/**
 * Kept so callers/tests that pass `{ perServer: false }` still compile.
 * Local mode has a single server: the page always names this origin.
 */
export interface RenderHtmlOptions {
  perServer?: boolean;
}

export async function renderHtmlContent(
  htmlPath: string,
  _opts: RenderHtmlOptions = {},
): Promise<string> {
  const htmlContent = await fs.readFile(htmlPath, "utf-8");
  const assetManifest = await getRuntimeAssetManifest();
  // Local mode is same-origin: no CDN, no external keys, no per-version page.
  const cdnBase = ServerEnv.cdnBase();
  return ejs.render(htmlContent, {
    cluster: JSON.stringify(ServerEnv.cluster()),
    instanceLetter: JSON.stringify(ServerEnv.instanceLetter()),
    instanceId: JSON.stringify(ServerEnv.instanceId()),
    serverHost: undefined,
    siteHost: undefined,
    gitCommit: JSON.stringify(ServerEnv.gitCommit()),
    assetManifest: JSON.stringify(assetManifest),
    cdnBase: JSON.stringify(cdnBase),
    cdnBaseRaw: cdnBase,
    gameEnv: JSON.stringify(ServerEnv.gameEnvName()),
    // Truthy, so index.html drops the Turnstile <script> block. Local mode
    // has no challenge and must not load a third-party script.
    casualMode: JSON.stringify(true),
    turnstileSiteKey: undefined,
    jwtAudience: JSON.stringify(ServerEnv.jwtAudience()),
    stripePublishableKey: undefined,
    faroCollectorUrl: undefined,
    manifestHref: buildAssetUrl("manifest.json", assetManifest, cdnBase),
    faviconHref: buildAssetUrl("images/Favicon.svg", assetManifest, cdnBase),
    gameplayScreenshotUrl: buildAssetUrl(
      "images/GameplayScreenshot.png",
      assetManifest,
      cdnBase,
    ),
    backgroundImageUrl: buildAssetUrl(
      "images/background.webp",
      assetManifest,
      cdnBase,
    ),
    desktopLogoImageUrl: buildAssetUrl(
      "images/OpenFront.png",
      assetManifest,
      cdnBase,
    ),
    mobileLogoImageUrl: buildAssetUrl("images/OF.png", assetManifest, cdnBase),
  });
}

export async function getAppShellContent(htmlPath: string): Promise<string> {
  let cachedContent = appShellContentCache.get(htmlPath);
  if (!cachedContent) {
    cachedContent = renderHtmlContent(htmlPath).catch((error: unknown) => {
      appShellContentCache.delete(htmlPath);
      throw error;
    });
    appShellContentCache.set(htmlPath, cachedContent);
  }
  return cachedContent;
}

export function clearAppShellContentCache(): void {
  appShellContentCache.clear();
}

export function setAppShellCacheHeaders(res: Response): void {
  res.setHeader("Cache-Control", APP_SHELL_CACHE_CONTROL);
  res.setHeader("Content-Type", "text/html");
}

export function setHtmlNoCacheHeaders(res: Response): void {
  setNoStoreHeaders(res);
  res.setHeader("ETag", "");
  res.setHeader("Content-Type", "text/html");
}

export async function renderAppShell(
  res: Response,
  htmlPath: string,
): Promise<void> {
  const rendered = await getAppShellContent(htmlPath);
  setAppShellCacheHeaders(res);
  res.send(rendered);
}
