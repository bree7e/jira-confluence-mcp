import {
  mkdir,
  readFile,
  rename,
  writeFile,
  rm,
  rmdir,
  lstat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ExportResult } from "./export-page.js";

export interface ManifestEntry {
  source: string;
  version: number;
  converter: string;
  converterVersion: string;
  hash: string;
  linkedPageIds: string[];
  warnings: string[];
}
interface Manifest {
  schema: 1;
  pages: Record<string, ManifestEntry>;
}
export interface ImportReport {
  pageId: string;
  status: "created" | "updated" | "unchanged" | "conflict";
  path: string;
  warnings: string[];
  message?: string;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function atomicWrite(path: string, text: string) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function rejectSymlink(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Refusing symlink: " + path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Serialize writers per directory. Never overwrite an unmanaged or locally edited page. */
export async function saveImport(
  result: ExportResult,
  directory: string,
): Promise<ImportReport> {
  if (!/^\d+$/.test(result.pageId)) throw new Error("Invalid page ID");
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  await rejectSymlink(root);
  const lock = join(root, ".import-lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("Import directory is locked: " + root);
    throw error;
  }
  try {
    const path = join(root, result.pageId + ".md"),
      manifestPath = join(root, ".confluence-import.json");
    await rejectSymlink(path);
    await rejectSymlink(manifestPath);
    const raw = await optionalRead(manifestPath);
    const manifest: Manifest = raw ? JSON.parse(raw) : { schema: 1, pages: {} };
    if (
      manifest.schema !== 1 ||
      !manifest.pages ||
      typeof manifest.pages !== "object" ||
      Array.isArray(manifest.pages)
    )
      throw new Error("Unsupported import manifest");
    const previous = manifest.pages[result.pageId],
      current = await optionalRead(path);
    const report = (
      status: ImportReport["status"],
      message?: string,
    ): ImportReport => ({
      pageId: result.pageId,
      status,
      path,
      warnings: result.warnings,
      ...(message ? { message } : {}),
    });
    if (previous && previous.source !== result.source)
      return report(
        "conflict",
        "Page ID belongs to a different Confluence source",
      );
    if (
      current !== undefined &&
      (!previous || hash(current) !== previous.hash)
    ) {
      return report(
        "conflict",
        "Local file has unmanaged changes; original preserved",
      );
    }
    if (previous && previous.version > result.version)
      return report("conflict", "Refusing to replace a newer source version");
    const entry: ManifestEntry = {
      source: result.source,
      version: result.version,
      converter: result.converter,
      converterVersion: result.converterVersion,
      hash: hash(result.markdown),
      linkedPageIds: result.linkedPageIds,
      warnings: result.warnings,
    };
    if (
      current === result.markdown &&
      JSON.stringify(previous) === JSON.stringify(entry)
    )
      return report("unchanged");
    if (current !== result.markdown) await atomicWrite(path, result.markdown);
    manifest.pages[result.pageId] = entry;
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    return report(current === undefined ? "created" : "updated");
  } finally {
    await rmdir(lock);
  }
}
