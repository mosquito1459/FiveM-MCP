import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeClient } from "../bridgeClient.js";
import { readClientLog } from "../clientLog.js";
import { text, json, fail, evalResult } from "./result.js";

const target = z.number().int().optional().describe("Server ID of the player. Omit to use the first connected player.");

export function registerClientTools(server: McpServer, bridge: BridgeClient) {
  const run = async (code: string, targetPlayerId?: number, timeoutMs?: number) => {
    try {
      return evalResult(await bridge.evalClientLua(code, targetPlayerId, timeoutMs));
    } catch (err: any) {
      return fail(err.message);
    }
  };

  server.tool(
    "eval_client_lua",
    "Runs Lua inside the game client (natives, PlayerPedId(), Wait() allowed). To run an in-game chat/F8 command like a player would, use ExecuteCommand('mycmd arg1'). Use `return` to get a value.",
    {
      code: z.string().describe("Client Lua, e.g. 'return GetEntityCoords(PlayerPedId())'."),
      targetPlayerId: target,
      timeoutMs: z.number().int().optional().describe("How long the server waits for the client (default 15000)."),
    },
    async ({ code, targetPlayerId, timeoutMs }) => run(code, targetPlayerId, timeoutMs)
  );

  server.tool(
    "trigger_client_event",
    "Triggers a client net event on the player from the server.",
    {
      eventName: z.string(),
      args: z.array(z.any()).default([]),
      targetPlayerId: target,
    },
    async ({ eventName, args, targetPlayerId }) => {
      try {
        return json(await bridge.triggerClientEvent(eventName, targetPlayerId, args));
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );

  server.tool(
    "get_player_coords",
    "Player ped position and heading.",
    { targetPlayerId: target },
    async ({ targetPlayerId }) =>
      run("local p = PlayerPedId() local c = GetEntityCoords(p) return { x = c.x, y = c.y, z = c.z, heading = GetEntityHeading(p) }", targetPlayerId)
  );

  server.tool(
    "set_player_coords",
    "Teleports the player ped.",
    { x: z.number(), y: z.number(), z: z.number(), heading: z.number().optional(), targetPlayerId: target },
    async ({ x, y, z: zz, heading, targetPlayerId }) =>
      run(
        `local p = PlayerPedId() SetEntityCoords(p, ${x}+0.0, ${y}+0.0, ${zz}+0.0, false, false, false, false)` +
          (heading === undefined ? "" : ` SetEntityHeading(p, ${heading}+0.0)`) +
          " return true",
        targetPlayerId
      )
  );

  server.tool(
    "spawn_client_vehicle",
    "Spawns a vehicle 5m in front of the player and seats them in it.",
    { model: z.string().regex(/^[\w-]+$/).describe("Vehicle model name, e.g. 'adder'."), targetPlayerId: target },
    async ({ model, targetPlayerId }) =>
      run(
        `local hash = GetHashKey("${model}")
         if not IsModelInCdimage(hash) then return { error = "unknown model ${model}" } end
         RequestModel(hash)
         local t = GetGameTimer() + 5000
         while not HasModelLoaded(hash) and GetGameTimer() < t do Wait(50) end
         if not HasModelLoaded(hash) then return { error = "model load timeout" } end
         local p = PlayerPedId()
         local c = GetOffsetFromEntityInWorldCoords(p, 0.0, 5.0, 0.0)
         local veh = CreateVehicle(hash, c.x, c.y, c.z, GetEntityHeading(p), true, false)
         SetPedIntoVehicle(p, veh, -1)
         SetModelAsNoLongerNeeded(hash)
         return { netId = NetworkGetNetworkIdFromEntity(veh) }`,
        targetPlayerId
      )
  );

  server.tool(
    "read_client_log",
    "Reads the local FiveM client log (CitizenFX_log_*.log): client script errors, F8 console prints, connection errors. For errors use filter 'SCRIPT ERROR|error during|Warning' — errors inside NUI callbacks are logged as 'error during NUI callback ...', not 'SCRIPT ERROR'.",
    {
      lines: z.number().int().default(100).describe("Return the last N (matching) lines."),
      filter: z.string().optional().describe("Case-insensitive regex, e.g. 'SCRIPT ERROR|my_resource'."),
    },
    async ({ lines, filter }) => {
      try {
        const r = await readClientLog(lines, filter);
        return text(`${r.file}\n${r.lines.join("\n") || "(no matching lines)"}`);
      } catch (err: any) {
        return fail(err.message);
      }
    }
  );
}
