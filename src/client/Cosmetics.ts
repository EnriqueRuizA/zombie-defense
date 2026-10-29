import type { Cosmetics } from "@zombie-defense/shared/CosmeticSchemas";
import type { PlayerCosmetics } from "@zombie-defense/shared/WireSchemas";

/**
 * Local-only cosmetics facade (docs/LocalMode.md R6: no cosmetics service).
 *
 * There is no catalog to fetch and no account to fetch it for, so every
 * accessor answers with the empty catalog / the empty cosmetic set. Callers
 * keep their shape — they degrade to default visuals exactly as they did on
 * the first frame before a catalog arrived.
 */

/** A currency top-up the player cannot afford. Kept for the dialog's shape. */
export interface InsufficientCurrency {
  /** Display name of the currency, e.g. "Plutonium". */
  currency: string;
  /** How much more currency is needed (raw; localized in the dialog text). */
  shortfall: number;
  /** Display name of the item being bought. */
  item: string;
  /** Whether the currency can be topped up (hard currency only). */
  canTopUp: boolean;
}

export function getCachedCosmetics(): Cosmetics | null {
  return null;
}

export async function fetchCosmetics(): Promise<Cosmetics | null> {
  return null;
}

export async function prewarmCosmetics(): Promise<void> {}

export async function getPlayerCosmetics(
  opts: { verified?: boolean } = {},
): Promise<PlayerCosmetics> {
  return opts.verified === true ? { verified: true } : {};
}

export async function getPlayerCosmeticsRefs(): Promise<Record<string, never>> {
  return {};
}
