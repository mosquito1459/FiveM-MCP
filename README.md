# FiveM MCP

A Claude Code plugin that lets an agent **build and test FiveM resources against your local FXServer and running game**:
write a resource → `refresh`/`ensure` → drive the game → read server console, client errors, NUI and screenshots → fix → repeat.

It ships three things:

| Part | What it is |
| :-- | :-- |
| `mcp-server/` | MCP server (single bundled file, no `npm install` needed) |
| `fxserver-resources/ai_dev_bridge/` | FXServer resource the MCP talks to (server/client Lua eval, console buffer, screenshots, entity inspector) |
| `skills/fivem-dev/` | Skill that teaches the agent the dev loop and the gotchas |

> **Dev servers only.** `eval_server_lua` / `eval_client_lua` are remote code execution by design. The bridge accepts only localhost requests carrying the token, but never install `ai_dev_bridge` on a public server.

## Requirements

- FXServer and the FiveM client on the **same PC** as Claude Code (the bridge is localhost-only; NUI and the client log are local)
- OneSync, the [`screencapture`](https://github.com/itschip/screencapture) resource (for game screenshots), Node.js 20+

## Install

1. **Server side**: copy `fxserver-resources/ai_dev_bridge` into your server's `resources/` and add to your cfg (keep the token out of git):
   ```cfg
   set rcon_password "..."            # probably already set
   set ai_bridge_token "long-random-string"
   ensure screencapture
   ensure ai_dev_bridge
   ```
2. **Claude Code**:
   ```
   /plugin marketplace add mosquito1459/FiveM-MCP
   /plugin install fivem-mcp@fivem-mcp
   ```
   Claude Code asks for the RCON password and bridge token. They're stored in your OS credential store; change them later in `/plugin` → manage.
   Turn **Return images** off if your model or MCP host can't take image input; every tool still returns its data as text.

Check it: start the server, join with the game, and ask Claude *"check the fivem connection"* (it calls `get_server_status`).

## Tools

| Layer | Tools |
| :-- | :-- |
| Server | `execute_server_command` (RCON), `restart_resource` (refresh + ensure), `get_server_console`, `eval_server_lua`, `get_server_status` |
| Client | `eval_client_lua` (use `ExecuteCommand('cmd')` to "type" commands), `trigger_client_event`, `get_player_coords`, `set_player_coords`, `spawn_client_vehicle`, `read_client_log` |
| NUI (CEF DevTools :13172) | `list_nui_frames`, `inspect_nui_dom`, `eval_nui_js`, `simulate_nui_click`, `simulate_nui_input`, `capture_nui_screenshot`, `get_nui_console` |
| Vision | `capture_game_screenshot`, `inspect_entities` |

`inspect_entities` lists vehicles, peds and objects around the player. For each one you get model, netId, entity handle, exact position, distance, screen position, and whether a wall is in the way. It also reports which entity is in front of the player. Results come back as a plain-text report plus JSON, and the report is printed to F8. It can also draw native labels in-game and return a screenshot showing them. Capture tools take `saveTo` to keep the image file.

## Manual MCP setup (without the plugin)

```bash
cd mcp-server && npm install && npm run build
cp .env.example .env    # fill FXSERVER_RCON_PASSWORD and AI_BRIDGE_TOKEN
claude mcp add --scope user fivem -- node /path/to/FiveM-MCP/mcp-server/dist/fivem-mcp.mjs
```

## Development

- `npm run build` typechecks and bundles to `mcp-server/dist/fivem-mcp.mjs`. **Commit that file**, because plugin installs use it as-is.
- Try local changes without installing: `claude --plugin-dir /path/to/FiveM-MCP`
- `claude plugin validate .` before publishing.

## Known limits

- No keyboard/mouse input into the 3D world; use natives or commands through `eval_client_lua`.
- Game screenshots don't include NUI; use `capture_nui_screenshot`.
- `get_nui_console` only captures messages logged after the MCP first connects to DevTools.
- Client eval results travel as a net event, so keep them to a few KB.
