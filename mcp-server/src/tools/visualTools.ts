import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeClient } from "../bridgeClient.js";
import { fail, image, json, text } from "./result.js";

const target = z.number().int().optional().describe("Server ID of the player. Omit to use the first connected player.");
const saveTo = z.string().optional().describe("Also write the image to this file path (extension added if missing).");

async function screenshot(bridge: BridgeClient, targetPlayerId?: number) {
  const uri = await bridge.captureScreenshot(targetPlayerId);
  const m = uri.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) throw new Error(`Unexpected screenshot payload: ${uri.slice(0, 80)}`);
  return { mimeType: m[1], base64: m[2] };
}

export function registerVisualTools(server: McpServer, bridge: BridgeClient) {
  server.tool(
    "capture_game_screenshot",
    "Screenshot of the player's game view via the `screencapture` resource (3D scene, minimap, native DrawText). NUI is NOT included; use capture_nui_screenshot for UI.",
    { targetPlayerId: target, saveTo },
    async ({ targetPlayerId, saveTo }) => {
      try {
        const s = await screenshot(bridge, targetPlayerId);
        return await image(s.base64, s.mimeType, { saveTo });
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );

  server.tool(
    "inspect_entities",
    "Finds vehicles/peds/objects around the player. Returns first a plain-text report (player id/name/position/heading, then one line per entity: model, distance in metres, exact position, heading, entity handle, netId, plate, screen position) — " +
      "trust these numbers over anything read from the image — then the same data as JSON (normalized screen coords 0..1, top-left origin). The report is also printed to the client F8 console. " +
      "`centerLabel` is the on-screen entity closest to the screen centre (i.e. 'the one in front'). " +
      "By default it also draws an in-game label '[n] model / ent / net / coords' over each entity (native DrawText) and returns a game screenshot showing them. " +
      "The JSON alone is enough to act on, so with screenshot:false this works for models without image input.",
    {
      types: z.array(z.enum(["vehicle", "ped", "object"])).default(["vehicle", "ped"]),
      radius: z.number().default(30).describe("Metres around the player."),
      max: z.number().int().default(8).describe("Max entities (closest first)."),
      overlay: z.boolean().default(true).describe("Draw labels in-game."),
      durationMs: z.number().int().default(8000).describe("How long labels stay on screen. 0 clears them."),
      screenshot: z.boolean().default(true).describe("Return a game screenshot with the labels."),
      targetPlayerId: target,
      saveTo,
    },
    async ({ types, radius, max, overlay, durationMs, screenshot: wantShot, targetPlayerId, saveTo }) => {
      try {
        const opts = { types, radius, max, durationMs: overlay ? durationMs : 0 };
        const r = await bridge.evalClientLua(`return AiBridgeInspect(json.decode(${JSON.stringify(JSON.stringify(opts))}))`, targetPlayerId);
        if (!r.success) return fail(`inspect failed: ${r.error}`);
        // plain-text report first (exact numbers, easiest to read), then the full JSON
        const { report, ...rest } = r.result as { report: string };
        const data = { content: [...text(report).content, ...json(rest).content] };
        if (!wantShot) return data;
        await new Promise((res) => setTimeout(res, 150)); // let the labels render for a few frames
        const s = await screenshot(bridge, targetPlayerId);
        const img = await image(s.base64, s.mimeType, { saveTo });
        return { content: [...data.content, ...img.content] };
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );
}
