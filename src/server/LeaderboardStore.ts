import { ID } from "@zombie-defense/engine-api/Schemas";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { logger } from "./Logger";

// The local CSV leaderboard (docs/CasualMode.md). This module owns the file
// format, the defensive sanitization (R24), the ordering/trim and the atomic
// write (R13/R20) — and nothing else: no HTTP, no IPC, no game types beyond
// the row shape. The only writer in the deployment is the master process, so
// there is no cross-process locking to do; submissions are still funneled
// through one internal queue so two games ending on the same tick cannot
// interleave their read-modify-write cycles.
//
// Column order is part of the format: `name,score,kills,won,game_id,duration_s,at`,
// UTF-8 without BOM, "\n" line endings, one trailing newline.

export const LEADERBOARD_COLUMNS = [
  "name",
  "score",
  "kills",
  "won",
  "game_id",
  "duration_s",
  "at",
] as const;

export type LeaderboardScope = "all" | "winners";

export interface LeaderboardRow {
  name: string;
  score: number;
  kills: number;
  won: 0 | 1;
  game_id: string;
  duration_s: number;
  // ISO-8601 UTC, e.g. 2026-10-17T12:34:56.789Z.
  at: string;
}

/** What GET /api/leaderboard hands to a client (R25). */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  kills: number;
  won: 0 | 1;
  at: string;
}

/**
 * Wire shape of one row over the master/worker IPC channel. Deliberately
 * TYPES only: range and charset rules live in sanitizeLeaderboardRow, which
 * the master runs on every row it receives (R24) — a permissive schema that
 * rejects on range would drop the whole batch, and a row must never be able to
 * take the message down with it.
 */
export const LeaderboardRowSchema = z.object({
  name: z.string(),
  score: z.number(),
  kills: z.number(),
  won: z.union([z.literal(0), z.literal(1)]),
  game_id: z.string(),
  duration_s: z.number(),
  at: z.string(),
});

export interface LeaderboardLimits {
  topN: number;
  maxName: number;
  scoreMax: number;
  killsMax: number;
}

export interface LeaderboardLog {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export type SanitizeResult =
  | { ok: true; row: LeaderboardRow }
  | { ok: false; reason: string };

// CSV metacharacters the format does not quote for.
const DISALLOWED_NAME_CHARS = /[,"]/g;

// Control characters (C0 plus DEL), newlines and carriage returns among them.
// Written as a code-point pass rather than a regex: a control character in a
// pattern is what no-control-regex exists to catch, and this reads the same.
// Each disallowed character becomes a space, exactly what the old pattern did.
function replaceControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code <= 0x1f || code === 0x7f ? " " : ch;
  }
  return out;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * R24, defensivo: nunca confiar en lo que llega por IPC ni en lo que hay en el
 * fichero. Recorta los separadores/caracteres de control, colapsa espacios,
 * limita el largo y normaliza el rango de cada columna. Un valor numérico fuera
 * de rango se acota (un juego con tiles > SCORE_MAX sigue siendo un juego); una
 * columna con forma imposible (nombre ilegible tras limpiar, game_id ajeno al
 * schema, `at` que no es ISO-8601 UTC) descarta la fila entera con motivo.
 */
export function sanitizeLeaderboardRow(
  raw: unknown,
  limits: LeaderboardLimits,
): SanitizeResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "row is not an object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.name !== "string") {
    return { ok: false, reason: "name is not a string" };
  }
  const name = normalizeName(r.name, limits.maxName);
  if (name === null) {
    return { ok: false, reason: "name empty after sanitization" };
  }

  const score = clampInt(r.score, 0, limits.scoreMax);
  if (score === null) return { ok: false, reason: "score is not a number" };
  const kills = clampInt(r.kills, 0, limits.killsMax);
  if (kills === null) return { ok: false, reason: "kills is not a number" };

  if (r.won !== 0 && r.won !== 1) {
    return { ok: false, reason: "won is not 0 or 1" };
  }

  if (typeof r.game_id !== "string" || !ID.safeParse(r.game_id).success) {
    return { ok: false, reason: "game_id is not a valid id" };
  }

  const duration = clampInt(r.duration_s, 0, Number.MAX_SAFE_INTEGER);
  if (duration === null) {
    return { ok: false, reason: "duration_s is not a number" };
  }

  if (typeof r.at !== "string" || !ISO_UTC.test(r.at)) {
    return { ok: false, reason: "at is not ISO-8601 UTC" };
  }
  if (Number.isNaN(Date.parse(r.at))) {
    return { ok: false, reason: "at is not a real date" };
  }

  return {
    ok: true,
    row: {
      name,
      score,
      kills,
      won: r.won,
      game_id: r.game_id,
      duration_s: duration,
      at: r.at,
    },
  };
}

/** Un nombre vacío o ilegible tras limpiar no se publica: devuelve null y la
 *  fila entera se descarta (R24). El largo se acota y se re-recorta por si la
 *  truncación dejó espacios colgando. */
export function normalizeName(raw: string, maxName: number): string | null {
  const cleaned = replaceControlChars(raw)
    .replace(DISALLOWED_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxName)
    .trim();
  return cleaned.length === 0 ? null : cleaned;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

/** Fila ya saneada -> texto CSV (sin comillas: el nombre no puede contenerlas). */
export function serializeLeaderboardRow(row: LeaderboardRow): string {
  return [
    row.name,
    row.score,
    row.kills,
    row.won,
    row.game_id,
    row.duration_s,
    row.at,
  ].join(",");
}

export function serializeLeaderboard(rows: readonly LeaderboardRow[]): string {
  const lines = [LEADERBOARD_COLUMNS.join(",")];
  for (const row of rows) lines.push(serializeLeaderboardRow(row));
  return lines.join("\n") + "\n";
}

/** Un error de E/S por línea no invalida el tablero: se descarta la línea. */
function parseCsvLine(line: string): Record<string, unknown> | null {
  const fields = line.split(",");
  if (fields.length !== LEADERBOARD_COLUMNS.length) return null;
  const out: Record<string, unknown> = {};
  LEADERBOARD_COLUMNS.forEach((column, i) => {
    out[column] = fields[i];
  });
  // Las tres columnas numéricas se convierten a número ANTES de sanear, para
  // que "12000000" sea un score acotable y no un string inválido.
  for (const column of ["score", "kills", "won", "duration_s"] as const) {
    const value = Number(out[column]);
    out[column] = Number.isNaN(value) ? out[column] : value;
  }
  return out;
}

export interface ParseLeaderboardResult {
  rows: LeaderboardRow[];
  skipped: number;
}

export function parseLeaderboard(
  text: string,
  limits: LeaderboardLimits,
): ParseLeaderboardResult {
  const rows: LeaderboardRow[] = [];
  let skipped = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (line.trim().length === 0) continue;
    if (i === 0 && line === LEADERBOARD_COLUMNS.join(",")) continue; // cabecera
    const raw = parseCsvLine(line);
    if (raw === null) {
      skipped++;
      continue;
    }
    const result = sanitizeLeaderboardRow(raw, limits);
    if (result.ok) {
      rows.push(result.row);
    } else {
      skipped++;
    }
  }
  return { rows, skipped };
}

/**
 * Orden total y determinista: score desc, y a igual score los kills desc; a
 * empate completo, la partida más antigua primero y, si aún así empatan, el
 * nombre — así dos cargas del mismo fichero dan el mismo tablero y un puesto
 * no parpadea entre reinicios.
 */
export function sortAndTrim(
  rows: readonly LeaderboardRow[],
  topN: number,
): LeaderboardRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.kills - a.kills ||
        a.at.localeCompare(b.at) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, topN);
}

export interface LeaderboardStoreOptions {
  path: string;
  limits: LeaderboardLimits;
  log?: LeaderboardLog;
}

export interface SubmitOutcome {
  written: number;
  skipped: number;
}

const defaultLog: LeaderboardLog = logger.child({
  component: "LeaderboardStore",
});

export class LeaderboardStore {
  private readonly filePath: string;
  private readonly limits: LeaderboardLimits;
  private readonly log: LeaderboardLog;
  private rows: LeaderboardRow[] = [];
  private writeQueue: Promise<unknown> = Promise.resolve();
  // R13: un fallo de E/S desactiva el ranking entero (no un intento) — el
  // juego sigue sin verse afectado y el motivo queda en el log.
  private ioDisabled = false;

  constructor(options: LeaderboardStoreOptions) {
    this.filePath = options.path;
    this.limits = options.limits;
    this.log = options.log ?? defaultLog;
  }

  get disabled(): boolean {
    return this.ioDisabled;
  }

  get file(): string {
    return this.filePath;
  }

  /**
   * Boot (R13): ausente => tablero vacío; corrupto => se cargan las filas
   * válidas y se descartan las inválidas con warning. Nunca lanza.
   */
  async load(): Promise<void> {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.rows = [];
        this.log.info("leaderboard file absent, starting empty", {
          path: this.filePath,
        });
        return;
      }
      this.ioFailure("loading leaderboard", error);
      return;
    }
    if (text.charCodeAt(0) === 0xfeff) {
      // Un BOM arruinaría la cabecera; se ignora y el resto se parsea.
      text = text.slice(1);
    }
    const parsed = parseLeaderboard(text, this.limits);
    if (parsed.skipped > 0) {
      this.log.warn("discarded invalid leaderboard rows on load", {
        path: this.filePath,
        skipped: parsed.skipped,
        kept: parsed.rows.length,
      });
    }
    this.rows = sortAndTrim(parsed.rows, this.limits.topN);
  }

  /** Tablero en memoria, ya rankeado. Sin I/O: la ruta GET nunca toca disco. */
  entries(): LeaderboardEntry[] {
    return this.rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      score: row.score,
      kills: row.kills,
      won: row.won,
      at: row.at,
    }));
  }

  /**
   * Inserta lo que el master recibió por IPC (R20), re-validando cada fila
   * (R24: la sanitización es defensiva, también para lo que ya "sabemos" que
   * es bueno) y reescribiendo el fichero de forma atómica. Devuelve cuántas
   * filas entraron; nunca lanza hacia el llamante.
   */
  submit(incoming: readonly unknown[]): Promise<SubmitOutcome> {
    const run = this.writeQueue.then(() => this.doSubmit(incoming));
    // La cola no debe romperse por un fallo ya gestionado dentro.
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async doSubmit(incoming: readonly unknown[]): Promise<SubmitOutcome> {
    if (this.ioDisabled) {
      this.log.warn("leaderboard disabled, dropping submission", {
        rows: incoming.length,
      });
      return { written: 0, skipped: incoming.length };
    }

    const accepted: LeaderboardRow[] = [];
    let skipped = 0;
    for (const raw of incoming) {
      const result = sanitizeLeaderboardRow(raw, this.limits);
      if (result.ok) {
        accepted.push(result.row);
      } else {
        skipped++;
        this.log.warn("discarded invalid leaderboard row", {
          reason: result.reason,
        });
      }
    }
    if (accepted.length === 0) {
      return { written: 0, skipped };
    }

    const next = sortAndTrim([...this.rows, ...accepted], this.limits.topN);
    try {
      await this.writeAtomic(next);
    } catch (error) {
      this.ioFailure("writing leaderboard", error);
      // Nothing landed: every row in the batch is dropped, sanitized or not.
      return { written: 0, skipped: incoming.length };
    }
    this.rows = next;
    return { written: accepted.length, skipped };
  }

  // Escritura atómica: tmp en el mismo directorio + rename. Un lector (el
  // proceso puede reiniciarse encima) ve el fichero viejo o el nuevo, nunca
  // uno a medias.
  private async writeAtomic(rows: readonly LeaderboardRow[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, serializeLeaderboard(rows), "utf-8");
    try {
      await fs.rename(tmp, this.filePath);
    } catch (error) {
      await fs.rm(tmp, { force: true });
      throw error;
    }
  }

  private ioFailure(what: string, error: unknown): void {
    this.ioDisabled = true;
    this.log.error(`leaderboard ${what} failed, ranking disabled`, {
      path: this.filePath,
      error: String(error),
    });
  }
}
