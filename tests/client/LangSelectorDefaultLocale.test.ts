import { afterEach, describe, expect, it, vi } from "vitest";
import { LangSelector } from "../../src/client/LangSelector";

// defaultLocale is private; drive it through a cast, the same way
// LangSelectorTranslate.test.ts and GameInfoView.test.ts do. Constructing
// without attaching skips connectedCallback's full language bootstrap.
function defaultLocale(): string {
  const selector = new LangSelector();
  return (selector as unknown as { defaultLocale(): string }).defaultLocale();
}

/** The language the client would actually load for defaultLocale()'s answer. */
function resolvedDefaultLanguage(): string {
  const selector = new LangSelector();
  const priv = selector as unknown as {
    defaultLocale(): string;
    getClosestSupportedLang(lang: string): string;
  };
  return priv.getClosestSupportedLang(priv.defaultLocale());
}

function withOsLocale(locale: string): void {
  vi.spyOn(navigator, "language", "get").mockReturnValue(locale);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Local-only build (docs/LocalMode.md R2): the Steam shell is gone, so the
// browser's OS locale is the only source left.
describe("LangSelector default locale", () => {
  it("uses the OS locale", () => {
    withOsLocale("et-EE");
    expect(defaultLocale()).toBe("et-EE");
  });

  // Asserted on the RESOLVED language, not on defaultLocale()'s raw return:
  // the raw form would be an echo, resolving is what makes each code carry
  // its own claim that it is a language we really ship.
  it("resolves for every language we ship", () => {
    for (const locale of [
      "bn",
      "ca",
      "eo",
      "et",
      "fa",
      "gl",
      "he",
      "hi",
      "mk",
      "sh",
      "sk",
      "sl",
      "tp",
    ]) {
      withOsLocale(locale);
      expect(resolvedDefaultLanguage(), locale).toBe(locale);
    }
  });

  it("returns the OS locale when it names a language we ship", () => {
    withOsLocale("sk-SK");
    expect(defaultLocale()).toBe("sk-SK");
  });
});
