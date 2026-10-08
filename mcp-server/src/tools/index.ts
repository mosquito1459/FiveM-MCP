import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RconClient } from "../rcon.js";
import { BridgeClient } from "../bridgeClient.js";
import { CdpClient } from "../cdpClient.js";
import { registerServerTools } from "./serverTools.js";
import { registerClientTools } from "./clientTools.js";
import { registerNuiTools } from "./nuiTools.js";
import { registerVisualTools } from "./visualTools.js";

export function registerAllTools(server: McpServer, rcon: RconClient, bridge: BridgeClient, cdp: CdpClient) {
  registerServerTools(server, rcon, bridge);
  registerClientTools(server, bridge);
  registerNuiTools(server, cdp);
  registerVisualTools(server, bridge);
}
