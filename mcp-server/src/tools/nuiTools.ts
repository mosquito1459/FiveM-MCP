import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CdpClient } from "../cdpClient.js";
import { text, json, fail, image } from "./result.js";

const resource = z.string().describe("Resource whose ui_page to target (e.g. 'bz-phone'), or 'root' for the whole NUI overlay.");

export function registerNuiTools(server: McpServer, cdp: CdpClient) {
  const wrap =
    <A,>(fn: (args: A) => Promise<any>) =>
    async (args: A) => {
      try {
        return await fn(args);
      } catch (err: any) {
        return fail(err.message);
      }
    };

  server.tool(
    "list_nui_frames",
    "Lists NUI frames loaded in the game client (each resource ui_page is an iframe at https://cfx-nui-<resource>/...).",
    {},
    wrap(async () => json(await cdp.listFrames()))
  );

  server.tool(
    "inspect_nui_dom",
    "Returns the live HTML of a resource's NUI (or the outerHTML of one selector).",
    { resourceName: resource, selector: z.string().optional() },
    wrap(async ({ resourceName, selector }) => text(await cdp.inspectDOM(resourceName, selector)))
  );

  server.tool(
    "eval_nui_js",
    "Evaluates a JavaScript expression inside a resource's NUI frame and returns the (JSON-serializable) result. Await promises by writing an async IIFE.",
    { resourceName: resource, expression: z.string() },
    wrap(async ({ resourceName, expression }) => json(await cdp.evaluateJS(resourceName, expression)))
  );

  server.tool(
    "capture_nui_screenshot",
    "Screenshot of a resource's NUI frame (or one element) via DevTools. Shows NUI only, not the 3D game; use capture_game_screenshot for the game view.",
    {
      resourceName: resource,
      selector: z.string().optional(),
      saveTo: z.string().optional().describe("Also write the PNG to this file path."),
    },
    wrap(async ({ resourceName, selector, saveTo }) => image(await cdp.screenshot(resourceName, selector), "image/png", { saveTo }))
  );

  server.tool(
    "simulate_nui_click",
    "Clicks an element inside a resource's NUI frame.",
    { resourceName: resource, selector: z.string() },
    wrap(async ({ resourceName, selector }) => {
      await cdp.click(resourceName, selector);
      return text(`clicked ${selector}`);
    })
  );

  server.tool(
    "simulate_nui_input",
    "Types text into an input inside a resource's NUI frame.",
    { resourceName: resource, selector: z.string(), text: z.string() },
    wrap(async ({ resourceName, selector, text: t }) => {
      await cdp.type(resourceName, selector, t);
      return text(`typed into ${selector}`);
    })
  );

  server.tool(
    "get_nui_console",
    "NUI console messages and uncaught JS errors captured since the MCP first connected to the game's DevTools.",
    { resourceName: z.string().optional().describe("Only this resource's frame (uncaught errors are always included).") },
    wrap(async ({ resourceName }) => {
      const logs = await cdp.consoleLogs(resourceName);
      return text(logs.length ? logs.map((l) => `[${l.type}] ${l.text}${l.url ? `  (${l.url})` : ""}`).join("\n") : "(no console messages captured)");
    })
  );
}
