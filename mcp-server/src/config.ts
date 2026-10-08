import dotenv from "dotenv";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load mcp-server/.env (manual installs) regardless of the cwd the MCP host launches us from.
// Plugin installs pass everything as env vars instead.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const host = process.env.FXSERVER_HOST || "127.0.0.1";
const port = Number(process.env.FXSERVER_PORT) || 30120;

export const config = {
  fxServer: {
    host,
    port,
    rconPassword: process.env.FXSERVER_RCON_PASSWORD || "",
    bridgeEndpoint: process.env.AI_BRIDGE_ENDPOINT || `http://${host}:${port}/ai_dev_bridge`,
    bridgeToken: process.env.AI_BRIDGE_TOKEN || "",
  },
  cefPort: Number(process.env.FIVEM_CEF_PORT) || 13172,
  // false = never send image content (for models/hosts without vision); tools still return their text/JSON
  images: !/^(0|false|no|off)$/i.test(process.env.FIVEM_MCP_IMAGES ?? ""),
  clientLogDir:
    process.env.FIVEM_LOG_DIR ||
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "FiveM", "FiveM.app", "logs"),
};
