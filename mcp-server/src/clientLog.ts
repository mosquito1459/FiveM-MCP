import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

/**
 * Tails the newest CitizenFX_log_*.log of the local FiveM client. This is where client-side
 * `SCRIPT ERROR`s and F8 console output land, so the AI can see client errors without the game UI.
 */
export async function readClientLog(lines = 100, filter?: string): Promise<{ file: string; lines: string[] }> {
  const dir = config.clientLogDir;
  const names = (await fs.readdir(dir)).filter((n) => /^CitizenFX_log_.*\.log$/.test(n));
  if (names.length === 0) throw new Error(`No CitizenFX_log_*.log in ${dir}`);
  const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(dir, n))).mtimeMs })));
  const newest = stats.sort((a, b) => b.t - a.t)[0].n;
  // ponytail: reads the whole file (usually <1MB per session); seek from the end if logs get huge
  let all = (await fs.readFile(path.join(dir, newest), "utf8")).split(/\r?\n/);
  if (filter) {
    const re = new RegExp(filter, "i");
    all = all.filter((l) => re.test(l));
  }
  return { file: newest, lines: all.slice(-lines) };
}
