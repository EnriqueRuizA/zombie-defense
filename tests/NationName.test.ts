import fs from "fs";

type Nation = {
  name?: string;
};

type Manifest = {
  nations?: Nation[];
};

describe("Map manifests: nation name constraints", () => {
  test("All nations' names must be ≤ 27 printable Extended-ASCII characters", () => {
    const manifestPaths = fs.globSync("resources/maps/**/manifest.json");

    expect(manifestPaths.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const manifestPath of manifestPaths) {
      try {
        const raw = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(raw) as Manifest;

        (manifest.nations ?? []).forEach((nation, idx) => {
          const name = nation?.name;
          if (typeof name !== "string") {
            violations.push(
              `${manifestPath} -> nations[${idx}].name is not a string`,
            );
            return;
          }
          if (name.length > 27) {
            violations.push(
              `${manifestPath} -> nations[${idx}].name "${name}" has length ${name.length} (> 27)`,
            );
            return;
          }
          // Allow only printable safe-extended-ASCII characters
          // within [0x20-0x7E] or [0xA0-0xFF], as in https://www.ascii-code.com/.
          const excludededCharacters = [...name].filter(
            (c) =>
              c.charCodeAt(0) < 0x20 ||
              (0x7e < c.charCodeAt(0) && c.charCodeAt(0) < 0xa0) ||
              0xff < c.charCodeAt(0),
          );
          if (0 < excludededCharacters.length) {
            violations.push(
              `${manifestPath} -> nations[${idx}].name "${name}" has ${excludededCharacters.length} non valid characters: ${excludededCharacters}`,
            );
            return;
          }
        });
      } catch (err) {
        violations.push(
          `Failed to parse ${manifestPath}: ${(err as Error).message}`,
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "Nation name violations:\n" +
          violations.join("\n") +
          "\nAll characters must be within non-colored region of the Extended-ASCII table: https://www.ascii-code.com/",
      );
    }
  });
});
