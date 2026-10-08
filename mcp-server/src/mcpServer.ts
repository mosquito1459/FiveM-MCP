import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { RconClient } from "./rcon.js";
import { BridgeClient } from "./bridgeClient.js";
import { CdpClient } from "./cdpClient.js";
import { registerAllTools } from "./tools/index.js";

export const SERVER_NAME = "fivem-ai-mcp";
export const SERVER_VERSION = "1.1.0";

export function createFivemMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const rcon = new RconClient({ host: config.fxServer.host, port: config.fxServer.port, password: config.fxServer.rconPassword });
  registerAllTools(server, rcon, new BridgeClient(), new CdpClient());
  return server;
}
