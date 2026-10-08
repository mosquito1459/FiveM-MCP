import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RconClient } from "../rcon.js";
import { BridgeClient } from "../bridgeClient.js";
import { text, json, fail, evalResult } from "./result.js";

export function registerServerTools(server: McpServer, rcon: RconClient, bridge: BridgeClient) {
  server.tool(
    "execute_server_command",
    "Runs a server console command via RCON and returns its console output (e.g. 'refresh', 'ensure my_res', 'status').",
    { command: z.string().describe("Raw server console command.") },
    async ({ command }) => {
      try {
        return text((await rcon.execute(command)).trim() || "(no console output)");
      } catch (err: any) {
        return fail(`RCON error: ${err.message}`);
      }
    }
  );

  server.tool(
    "restart_resource",
    "Runs 'refresh' (so new/renamed resources and fxmanifest changes are picked up) then 'ensure <name>'. Check get_server_console / read_client_log afterwards for script errors.",
    { resourceName: z.string().describe("Resource folder name.") },
    async ({ resourceName }) => {
      try {
        const refresh = await rcon.execute("refresh");
        const ensure = await rcon.execute(`ensure ${resourceName}`);
        return text(`${refresh.trim()}\n${ensure.trim()}`.trim() || `ensured ${resourceName}`);
      } catch (err: any) {
        return fail(`RCON error: ${err.message}`);
      }
    }
  );

  server.tool(
    "get_server_console",
    "Reads the FXServer console (all resources' prints and SCRIPT ERRORs) from the bridge ring buffer. Pass `since` = lastSeq from the previous call to get only new lines.",
    {
      since: z.number().int().default(0).describe("Only lines with seq > since."),
      limit: z.number().int().default(200).describe("Max lines (newest kept)."),
      filter: z.string().optional().describe("Case-insensitive regex to keep only matching lines, e.g. 'error|warn'."),
    },
    async ({ since, limit, filter }) => {
      try {
        const { lines, lastSeq } = await bridge.getConsole(since, limit);
        const re = filter ? new RegExp(filter, "i") : null;
        const body = lines
          .filter((l) => !re || re.test(l.message))
          .map((l) => `[${l.channel}] ${l.message.trimEnd()}`)
          .join("\n");
        return text(`lastSeq=${lastSeq}\n${body || "(no new lines)"}`);
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );

  server.tool(
    "eval_server_lua",
    "Runs Lua inside FXServer (global env of ai_dev_bridge; Wait() allowed). Use `return` to get a value; use exports.<res>:<fn>() to reach other resources.",
    { code: z.string().describe("Server Lua, e.g. 'return #GetPlayers()'.") },
    async ({ code }) => {
      try {
        return evalResult(await bridge.evalServerLua(code));
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );

  server.tool(
    "get_server_status",
    "Lists connected players (id, name, coords) and every resource with its state.",
    {},
    async () => {
      try {
        return json(await bridge.getStatus());
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );
}
