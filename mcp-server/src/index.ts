#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFivemMcpServer, SERVER_NAME, SERVER_VERSION } from "./mcpServer.js";

// stdout is the MCP channel: log to stderr only.
await createFivemMcpServer().connect(new StdioServerTransport());
console.error(`[${SERVER_NAME} v${SERVER_VERSION}] ready on stdio`);
