import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] as Content[] });
export const json = (v: unknown) => text(JSON.stringify(v, null, 2));
// eval responses: { success:false } must surface as a tool error, not a normal result
export const evalResult = (r: { success: boolean }) => (r.success ? json(r) : { isError: true, ...json(r) });
export const fail = (t: string) => ({ isError: true, ...text(t) });

const EXT: Record<string, string> = { "image/png": ".png", "image/webp": ".webp", "image/jpeg": ".jpg" };

/**
 * Image result. `saveTo` (optional) also writes the file so it can be reused (docs, editing, diffs);
 * a path without extension gets the right one. With FIVEM_MCP_IMAGES=false the image is left out.
 */
export async function image(base64: string, mimeType: string, opts: { caption?: string; saveTo?: string } = {}) {
  const notes: string[] = [];
  if (opts.saveTo) {
    const file = path.extname(opts.saveTo) ? opts.saveTo : opts.saveTo + (EXT[mimeType] ?? "");
    await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
    await fs.writeFile(file, Buffer.from(base64, "base64"));
    notes.push(`saved: ${path.resolve(file)}`);
  }
  if (opts.caption) notes.push(opts.caption);
  const content: Content[] = [];
  if (config.images) content.push({ type: "image", data: base64, mimeType });
  else notes.push("(image omitted: FIVEM_MCP_IMAGES=false)");
  if (notes.length) content.push({ type: "text", text: notes.join("\n") });
  return { content };
}
