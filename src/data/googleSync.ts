import { App } from "obsidian";
import {
  GOOGLE_MARKER,
  detectDateHeadingStyle,
  insertItemLine,
  joinPath,
  lineDates,
  monthFilePath,
  openMonthFile,
  parseItemLine,
} from "./markdown";

/** One line's worth of Google Calendar data, already resolved to a single techo day. */
export interface GoogleTechoEntry {
  /** Stable Google identity. Kept in sidecar metadata, never rendered into the Markdown line. */
  key: string;
  date: string;
  time?: string;
  title: string;
}

interface StoredGoogleEntry {
  date: string;
  time?: string;
  title: string;
}

interface GoogleSyncMetadata {
  version: 1;
  entries: Record<string, StoredGoogleEntry>;
}

export interface GoogleSyncScope {
  /** Inclusive ISO date. */
  from: string;
  /** Inclusive ISO date. */
  to: string;
}

export interface GoogleSyncResult {
  path: string;
  added: number;
  updated: number;
  /** Existing visible lines that matched a Google event and were adopted into sidecar metadata. */
  adopted: number;
  removed: number;
  /** Legacy inline %%gcal:...%% markers moved into sidecar metadata. */
  migrated: number;
  /** Visible lines newly inserted for these identities. Internal aggregation only. */
  addedKeys: string[];
  /** Visible lines actually removed for these identities. Internal aggregation only. */
  removedKeys: string[];
  /** Identities that newly entered this month's sidecar, including adopted existing lines. */
  enteredKeys: string[];
  /** Identities that left this month's sidecar, even when a hand-edited visible line was preserved. */
  leftKeys: string[];
}

/** Google-owned lines are now ordinary readable Markdown. Identity lives in the sidecar file. */
export function renderEntryLine(entry: GoogleTechoEntry): string {
  return `- ${entry.time ? `${entry.time} ` : ""}${entry.title}`;
}

function metadataFolder(folder: string): string {
  return joinPath(folder, ".my-system-techo");
}

function metadataPath(folder: string, year: number, month: number): string {
  return joinPath(metadataFolder(folder), `google-${year}-${String(month).padStart(2, "0")}.json`);
}

function validStoredEntry(value: unknown): value is StoredGoogleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StoredGoogleEntry>;
  return typeof entry.date === "string" && typeof entry.title === "string" && (entry.time === undefined || typeof entry.time === "string");
}

/** Hidden dot-folders are outside the Vault API's visible file cache, so use the Adapter directly. */
async function ensureAdapterFolder(app: App, folder: string): Promise<void> {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  if (!prefix) return;

  let current = "";
  for (const segment of prefix.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (await app.vault.adapter.exists(current)) continue;
    try {
      await app.vault.adapter.mkdir(current);
    } catch (error) {
      if (!(await app.vault.adapter.exists(current))) throw error;
    }
  }
}

async function readMetadata(app: App, folder: string, year: number, month: number): Promise<GoogleSyncMetadata> {
  const path = metadataPath(folder, year, month);
  try {
    if (!(await app.vault.adapter.exists(path))) return { version: 1, entries: {} };
    const parsed = JSON.parse(await app.vault.adapter.read(path)) as { entries?: Record<string, unknown> };
    const entries: Record<string, StoredGoogleEntry> = {};
    if (parsed?.entries && typeof parsed.entries === "object") {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (validStoredEntry(value)) entries[key] = value;
      }
    }
    return { version: 1, entries };
  } catch {
    // A damaged sidecar must never block the user's month file. A fresh sync can safely rebuild it
    // from exact visible-line matches for events that still exist in Google.
    return { version: 1, entries: {} };
  }
}

async function writeMetadata(app: App, folder: string, year: number, month: number, metadata: GoogleSyncMetadata): Promise<void> {
  const directory = metadataFolder(folder);
  await ensureAdapterFolder(app, directory);
  const path = metadataPath(folder, year, month);
  const text = `${JSON.stringify(metadata, null, 2)}\n`;
  // Adapter.write creates or replaces the hidden sidecar without relying on Vault's hidden-file cache.
  await app.vault.adapter.write(path, text);
}

function keySlug(key: string): string {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(0, separator) : key;
}

function dateInScope(date: string, scope?: GoogleSyncScope): boolean {
  return !scope || (date >= scope.from && date <= scope.to);
}

/**
 * Finds a visible line that still exactly matches what the plugin wrote on the previous sync.
 * Exact matching is intentional: if the user edits a Google line by hand, we leave that edited
 * line alone rather than deleting or overwriting something that may now be intentional content.
 */
function findStoredLine(lines: string[], stored: StoredGoogleEntry, claimed: Set<number>): number | null {
  const dates = lineDates(lines);
  for (let index = 0; index < lines.length; index++) {
    if (claimed.has(index) || dates[index] !== stored.date) continue;
    const parsed = parseItemLine(lines[index]);
    if (!parsed) continue;
    if ((parsed.time ?? "") === (stored.time ?? "") && parsed.title === stored.title) return index;
  }
  return null;
}

function findEntryLine(lines: string[], entry: GoogleTechoEntry, claimed: Set<number>): number | null {
  return findStoredLine(lines, { date: entry.date, time: entry.time, title: entry.title }, claimed);
}

/**
 * Reads markers from pre-sidecar versions, records their identities, and removes the markers from
 * the visible Markdown in place. Line count is unchanged, so every index remains stable.
 */
function migrateLegacyMarkers(lines: string[], legacySlug: string, entries: Record<string, StoredGoogleEntry>): number {
  const dates = lineDates(lines);
  let migrated = 0;

  lines.forEach((line, index) => {
    const parsed = parseItemLine(line);
    const raw = parsed?.googleId;
    if (!parsed || !raw || !dates[index]) return;

    // Before multi-calendar support markers carried only an event id. Treat those as belonging to
    // the configured legacy calendar even if that calendar failed during this particular fetch.
    const key = raw.includes(":") ? raw : `${legacySlug}:${raw}`;
    if (!entries[key]) entries[key] = { date: dates[index], time: parsed.time, title: parsed.title };

    const clean = line.replace(GOOGLE_MARKER, "").replace(/\s+$/, "");
    if (clean !== line) {
      lines[index] = clean;
      migrated++;
    }
  });

  return migrated;
}

/**
 * Mirrors `entries` into `<folder>/<YYYY-MM>.md`, while keeping Google identities in
 * `<folder>/.my-system-techo/google-YYYY-MM.json`.
 *
 * `syncedSlugs` names the calendars that were actually fetched: only their owned records may be
 * removed, so deselected or temporarily unreachable calendars keep the lines they already wrote.
 * When `scope` is supplied, deletion/ownership cleanup is limited to dates inside that range. This
 * lets one-day or partial-month refreshes coexist safely with the rest of the month's sidecar data.
 */
export async function applyGoogleEvents(
  app: App,
  folder: string,
  year: number,
  month: number,
  entries: GoogleTechoEntry[],
  syncedSlugs: string[],
  scope?: GoogleSyncScope,
  legacySlug = syncedSlugs[0] ?? "primary",
): Promise<GoogleSyncResult> {
  const path = monthFilePath(folder, year, month);
  const file = await openMonthFile(app, folder, year, month);

  const original = await app.vault.read(file);
  let lines = original.split(/\r?\n/);
  const style = detectDateHeadingStyle(lines);
  const result: GoogleSyncResult = {
    path,
    added: 0,
    updated: 0,
    adopted: 0,
    removed: 0,
    migrated: 0,
    addedKeys: [],
    removedKeys: [],
    enteredKeys: [],
    leftKeys: [],
  };

  const metadata = await readMetadata(app, folder, year, month);
  const previous: Record<string, StoredGoogleEntry> = { ...metadata.entries };
  result.migrated = migrateLegacyMarkers(lines, legacySlug, previous);

  const scopedEntries = entries.filter((entry) => dateInScope(entry.date, scope));
  const wanted = new Map(scopedEntries.map((entry) => [entry.key, entry]));
  const replacements = new Map<number, string>();
  const removals = new Set<number>();
  const insertions: GoogleTechoEntry[] = [];
  const claimed = new Set<number>();

  for (const entry of scopedEntries) {
    const stored = previous[entry.key];
    const desired = renderEntryLine(entry);

    if (stored) {
      const existingIndex = findStoredLine(lines, stored, claimed);
      if (existingIndex !== null) {
        claimed.add(existingIndex);
        if (stored.date === entry.date) {
          if (lines[existingIndex] !== desired) {
            replacements.set(existingIndex, desired);
            result.updated++;
          }
        } else {
          removals.add(existingIndex);
          insertions.push(entry);
          result.updated++;
        }
        continue;
      }

      // Metadata survived but the old visible line did not. If the desired line is already present,
      // simply re-attach ownership to it; otherwise recreate the Google line without touching any
      // manually altered former line.
      const recoveredIndex = findEntryLine(lines, entry, claimed);
      if (recoveredIndex !== null) {
        claimed.add(recoveredIndex);
        result.adopted++;
      } else {
        insertions.push(entry);
        result.updated++;
      }
      continue;
    }

    // This identity is newly owned by this month. It may be a genuinely new event or the destination
    // of a cross-month date move; the range aggregator resolves that distinction after every month.
    result.enteredKeys.push(entry.key);

    // First sidecar sync (or a newly created Google event): adopt an exact line already present in
    // the techo rather than duplicating it.
    const adoptable = findEntryLine(lines, entry, claimed);
    if (adoptable !== null) {
      claimed.add(adoptable);
      result.adopted++;
    } else {
      insertions.push(entry);
      result.added++;
      result.addedKeys.push(entry.key);
    }
  }

  // Remove events that disappeared from Google only for calendars that were successfully fetched.
  // The identity leaves sidecar ownership even when an exact visible line cannot be found because
  // the user edited it; in that case the visible Markdown is intentionally preserved.
  for (const [key, stored] of Object.entries(previous)) {
    if (wanted.has(key) || !syncedSlugs.includes(keySlug(key)) || !dateInScope(stored.date, scope)) continue;
    result.leftKeys.push(key);
    const existingIndex = findStoredLine(lines, stored, claimed);
    if (existingIndex !== null) {
      removals.add(existingIndex);
      result.removed++;
      result.removedKeys.push(key);
    }
  }

  for (const [index, text] of replacements) lines[index] = text;
  if (removals.size) lines = lines.filter((_, index) => !removals.has(index));
  for (const entry of insertions) lines = insertItemLine(lines, entry.date, renderEntryLine(entry), style);

  const nextEntries: Record<string, StoredGoogleEntry> = { ...previous };
  for (const [key, stored] of Object.entries(nextEntries)) {
    if (!wanted.has(key) && syncedSlugs.includes(keySlug(key)) && dateInScope(stored.date, scope)) delete nextEntries[key];
  }
  for (const entry of scopedEntries) {
    nextEntries[entry.key] = { date: entry.date, time: entry.time, title: entry.title };
  }

  const updated = lines.join("\n");
  if (updated !== original) await app.vault.modify(file, updated);
  await writeMetadata(app, folder, year, month, { version: 1, entries: nextEntries });
  return result;
}
