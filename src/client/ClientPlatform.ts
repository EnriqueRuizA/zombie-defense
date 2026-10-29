import type { ClientPlatform } from "@zombie-defense/shared/WireSchemas";

/**
 * Which platform this client is running on.
 *
 * Local-only build (docs/LocalMode.md): there is no desktop shell and no
 * game portal, so every client is the plain web build.
 */
export function clientPlatform(): ClientPlatform {
  return "web";
}
