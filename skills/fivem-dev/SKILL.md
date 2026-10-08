---
name: fivem-dev
description: Build, run and verify FiveM (FXServer / GTA V) resources against a live local server and game using the `fivem` MCP tools — restart resources, read server console and client errors, run server/client Lua, drive NUI menus, inspect entities (netId, model, position, distance) and take screenshots. Use this whenever the user works on FiveM scripts, fxmanifest.lua, client/server Lua, NUI/ui_page, natives, txAdmin/FXServer, or asks to "test it in game", spawn/inspect a vehicle, ped or object, find what entity is in front of the player, or check what the player sees — even if they don't mention the MCP.
---

# FiveM dev loop with the `fivem` MCP

These tools are hands and eyes inside a running **local** FXServer and the FiveM client on the same PC.
Use them to prove a change works in the real game instead of guessing from code.

## 0. Check the connection first

Call `get_server_status` once at the start. It should list the connected player(s).

| Symptom | Cause / fix |
| :-- | :-- |
| `Cannot reach .../ai_dev_bridge` | FXServer not running, or the `ai_dev_bridge` resource isn't started (see install below) |
| `503 ... ai_bridge_token` | convar `ai_bridge_token` not set on the server |
| `403 Invalid bridge token` | plugin's bridge token ≠ server convar |
| `No such player online` | nobody is connected; ask the user to join the server |
| `FiveM CEF DevTools not reachable` | the game client isn't running (NUI tools only) |
| `screencapture is not started` | `ensure screencapture` on the server (screenshots only) |
| RCON timeout | wrong `rcon_password`, or server down |

**Installing the server side** (only if missing — ask before editing the user's server):
copy `${CLAUDE_PLUGIN_ROOT}/fxserver-resources/ai_dev_bridge` into the server's `resources/` folder
(a folder that is already ensured, or add `ensure ai_dev_bridge`), add `set ai_bridge_token "<same token as the plugin>"`
to a cfg that is not committed (e.g. a secrets cfg), then `restart_resource ai_dev_bridge`.
It needs the `screencapture` resource for game screenshots. Never install it on a public server: `/eval` is remote code execution by design (it only accepts localhost + token).

## 1. The loop

1. **Write** the resource files directly in the server's `resources/` tree (`fxmanifest.lua`, client/server Lua, `html/`).
   If you don't know where the server lives, ask it instead of searching the disk: `eval_server_lua` with
   `return GetResourcePath(GetCurrentResourceName())` returns the bridge's own folder (e.g. `E:/srv/resources/[local]/ai_dev_bridge`).
   Its parent is a folder the server already loads. Put new resources next to it, or in another folder that `server.cfg` ensures (`ensure [folder]` loads everything inside).
   A resource outside any ensured folder still works with `restart_resource`, but it won't start on the next server boot, so tell the user.
2. **`restart_resource <name>`** — runs `refresh` + `ensure`, so new folders and manifest changes are picked up. Read its output: a typo in the manifest shows up here.
3. **Check errors on both sides** — this is where most bugs show up:
   - `get_server_console` with `filter: "error|warn"`. Keep the returned `lastSeq` and pass it as `since` next time to see only new lines.
   - `read_client_log` with `filter: "SCRIPT ERROR|error during|Warning"`. Errors thrown inside NUI callbacks are logged as `error during NUI callback ...`, **not** `SCRIPT ERROR`, so a filter on `SCRIPT ERROR` alone misses them.
4. **Exercise the feature** like a player would:
   - in-game commands: `eval_client_lua` with `ExecuteCommand('mycmd arg')`
   - events: `trigger_client_event`, or `eval_server_lua` with `TriggerClientEvent(...)`
   - menus: open it, then `simulate_nui_click` / `simulate_nui_input` on real selectors
5. **Verify with data first, pixels second** (see §2). Compare client vs server state when both are involved.
6. **Fix and repeat.** Then clean up: delete test entities, close menus (check `IsNuiFocused()` is false, or the user's mouse stays captured), and clear overlays (`inspect_entities` with `durationMs: 0`).

## 2. Seeing the game: text before images

**First decide whether you can actually see images.** If your model has no image input, or the host strips images, screenshots are useless to you. Use `inspect_entities` with `screenshot: false`, `inspect_nui_dom` and `eval_nui_js` instead; they carry the same facts as text. Users without vision can set the plugin option *Return images* to off.

Even with vision, take **numbers from text, not from the picture**. In-game labels are small and get misread (`13570` vs `I3570`, a lost minus sign). Use images to confirm layout and visual bugs.

- **`inspect_entities`** is the go-to for "what is around / in front of the player". Its first block is a plain-text report:
  ```
  PLAYER id 1 "Name"  pos 234.54, 340.44, 105.53  heading 120.4
  4 entities within 30m, showing 4 (closest first); in front (closest to screen centre): [1]
  [1] vehicle zentorno  dist 4.70m  pos 229.95, 339.51, 105.11  heading 111.7  ent 9986  net 65533  screen 0.528,0.509  plate 21IEB985
  [3] vehicle sultan  dist 10.61m  pos ...  BLOCKED (no line of sight)
  ```
  Then the same data as JSON. The report is also printed to the client F8 console.
  - "the car in front" = the `in front` label. Restrict with `types: ["vehicle"]`.
  - `onScreen` only means inside the camera view. `BLOCKED` means a wall is in between, so it won't be visible in a screenshot.
  - Labels `[n] model / ent / net / coords` are drawn in-game with native DrawText and **do** appear in game screenshots. They stay for `durationMs`; pass `durationMs: 0` to clear them.
  - `ent` is a client-local handle; only `net` (netId) means the same entity on server and other clients. Server side: `NetworkGetEntityFromNetworkId(netId)`.
- **`capture_game_screenshot`**: the 3D scene, minimap and DrawText, but **no NUI**.
- **`capture_nui_screenshot`**: `resourceName` = that resource's ui_page, or `"root"` = the whole NUI overlay.
- All capture tools take `saveTo: "<path>"` to also write the file (for docs, editing or comparing later). Use a native Windows path (`C:/...`), not a Git-Bash `/c/...` path.

## 3. Client Lua and NUI: things that bite

- `eval_client_lua` / `eval_server_lua` run **inside the `ai_dev_bridge` resource**. Other resources' locals and globals aren't visible. Go through `exports.<res>:<fn>()` or events. When writing a resource you will test, add a small test export that returns its state (e.g. `exports('getLast', ...)` on both client and server), so you can compare client vs server values directly.
- Use `return` to get values back, and keep results small (a few KB; they travel as a net event). `Wait()` is allowed. Multiple return values come back as an array.
- Natives returning BOOL often give `1`/`false` rather than `true`. Write `x == true or x == 1` when the boolean matters.
- Check native names: a wrong name is a runtime `attempt to call a nil value`, not a load error (e.g. it's `NetworkDoesNetworkIdExist`, not `NetworkDoesNetIdExist`).
- NUI: every resource's `ui_page` is an iframe at `https://cfx-nui-<resource>/`. `resourceName` must be exact. `list_nui_frames` shows what's loaded. Clicks work even without NUI focus.
- Wrap NUI callback bodies in `pcall` and always call `cb(...)`. If the Lua errors before `cb`, the page's `fetch` never resolves and the UI hangs (e.g. stuck on "Loading…").
- `get_nui_console` only captures messages logged after the first NUI tool call. Uncaught page errors can't be attributed to a frame, so they may come from another resource.
- `filter` arguments are **JavaScript** regexes (e.g. `[]]` matches nothing; use `\\]`).

## 4. Server side

- Server IDs are not always 1. Omit `targetPlayerId` to use the first connected player, or read the IDs from `get_server_status`.
- `execute_server_command` returns the command's own console output. Output that happens later (async errors, other resources) is only in `get_server_console`.
- With OneSync, server-created entities (`CreateVehicleServerSetter`) get a netId immediately. The client sees them once streamed in (`NetworkDoesNetworkIdExist`). Positions on client and server should agree within a few cm; a larger gap means sync or ownership problems.

## 5. Ground rules

- Dev servers only. Don't run destructive commands (`quit`, stopping other people's resources, DB writes) without asking.
- Leave the game as you found it: delete what you spawned, close menus, clear overlays.
- Report what you verified and how (which tool, what values), and what you could not verify.
