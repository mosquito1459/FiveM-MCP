-- ai_dev_bridge: localhost-only HTTP API at http://127.0.0.1:30120/ai_dev_bridge/*
-- DEV SERVERS ONLY: /eval is remote code execution by design.
local pending = {} -- reqId -> { res = res, target = playerId }
local nextReqId = 0

-- Server console ring buffer (everything printed to the server console, incl. other resources' errors)
local MAX_LINES = 2000
local consoleLines, consoleSeq = {}, 0
RegisterConsoleListener(function(channel, message)
    -- never print() in here: it would recurse
    consoleSeq = consoleSeq + 1
    consoleLines[#consoleLines + 1] = { seq = consoleSeq, channel = channel, message = message }
    if #consoleLines > MAX_LINES then table.remove(consoleLines, 1) end -- ponytail: O(n) shift, fine at 2k lines
end)

local function sendJson(res, status, data)
    res.writeHead(status, { ['Content-Type'] = 'application/json' })
    res.send(json.encode(data))
end

local function isLocal(address)
    address = address or ''
    return address:find('^127%.0%.0%.1') ~= nil or address:find('^%[?::1') ~= nil
end

local function authorized(req, res)
    local token = GetConvar('ai_bridge_token', '') -- read per request: secrets.cfg may be exec'd after ensure
    if token == '' then
        sendJson(res, 503, { error = 'Set convar ai_bridge_token in server.cfg to enable ai_dev_bridge' })
        return false
    end
    if not isLocal(req.address) then
        sendJson(res, 403, { error = 'ai_dev_bridge only accepts localhost requests' })
        return false
    end
    local auth = req.headers['Authorization'] or req.headers['authorization'] or ''
    if auth:gsub('^Bearer%s+', '') ~= token then
        sendJson(res, 403, { error = 'Invalid bridge token' })
        return false
    end
    return true
end

-- Explicit target, else the first connected player (server IDs are not always 1).
local function resolveTarget(requested)
    if requested then
        local id = tostring(requested)
        return GetPlayerName(id) and id or nil
    end
    return GetPlayers()[1]
end

local function startPending(res, target, timeoutMs)
    nextReqId = nextReqId + 1
    local reqId = tostring(nextReqId)
    pending[reqId] = { res = res, target = target }
    SetTimeout(timeoutMs, function()
        local p = pending[reqId]
        if p then
            pending[reqId] = nil
            sendJson(p.res, 504, { error = ('Player %s did not respond within %dms'):format(target, timeoutMs) })
        end
    end)
    return reqId
end

local function finishPending(reqId, status, data)
    local p = pending[reqId]
    if not p then return end
    pending[reqId] = nil
    sendJson(p.res, status, data)
end

local routes = {}

routes['GET /status'] = function(_, res)
    local players = {}
    for _, id in ipairs(GetPlayers()) do
        local coords = GetEntityCoords(GetPlayerPed(id))
        players[#players + 1] = {
            id = tonumber(id), name = GetPlayerName(id), ping = GetPlayerPing(id),
            coords = { x = coords.x, y = coords.y, z = coords.z },
        }
    end
    local resources = {}
    for i = 0, GetNumResources() - 1 do
        local name = GetResourceByFindIndex(i)
        if name then resources[#resources + 1] = { name = name, state = GetResourceState(name) } end
    end
    sendJson(res, 200, { players = players, resources = resources, consoleSeq = consoleSeq })
end

-- body: { since = <seq>, limit = <n> } -> lines newer than `since` (newest `limit` of them)
routes['POST /console'] = function(_, res, data)
    local since = tonumber(data.since) or 0
    local limit = tonumber(data.limit) or 200
    local out = {}
    for i = #consoleLines, 1, -1 do
        local line = consoleLines[i]
        if line.seq <= since or #out >= limit then break end
        table.insert(out, 1, line)
    end
    sendJson(res, 200, { lines = out, lastSeq = consoleSeq })
end

routes['POST /eval'] = function(_, res, data)
    if type(data.code) ~= 'string' or data.code == '' then return sendJson(res, 400, { error = 'Missing "code"' }) end
    -- run in a thread so the code may use Wait()
    CreateThread(function()
        local ok, result, ms = AiBridgeEval(data.code, '=ai_eval_server', os.clock)
        sendJson(res, 200, { success = ok, result = ok and result or nil, error = not ok and result or nil, executionTimeMs = ms * 1000 })
    end)
end

routes['POST /client-eval'] = function(_, res, data)
    if type(data.code) ~= 'string' or data.code == '' then return sendJson(res, 400, { error = 'Missing "code"' }) end
    local target = resolveTarget(data.targetPlayer)
    if not target then return sendJson(res, 404, { error = 'No such player online (is the game connected?)' }) end
    local reqId = startPending(res, target, tonumber(data.timeoutMs) or 15000)
    TriggerClientEvent('ai_dev_bridge:client:eval', target, reqId, data.code)
end

routes['POST /client-trigger'] = function(_, res, data)
    if type(data.event) ~= 'string' then return sendJson(res, 400, { error = 'Missing "event"' }) end
    local target = resolveTarget(data.targetPlayer)
    if not target then return sendJson(res, 404, { error = 'No such player online' }) end
    local args = data.args or {}
    TriggerClientEvent(data.event, target, table.unpack(args, 1, #args))
    sendJson(res, 200, { success = true, event = data.event, targetPlayer = tonumber(target) })
end

-- Uses the `screencapture` resource's server export; returns a base64 data URI.
routes['POST /screenshot'] = function(_, res, data)
    if GetResourceState('screencapture') ~= 'started' then
        return sendJson(res, 503, { error = 'Resource "screencapture" is not started' })
    end
    local target = resolveTarget(data.targetPlayer)
    if not target then return sendJson(res, 404, { error = 'No such player online' }) end
    local reqId = startPending(res, target, 20000)
    exports.screencapture:serverCapture(tonumber(target), {
        -- webp: ~90KB at 720p. 'jpg' is silently encoded as PNG by the canvas (~1.4MB), don't use it.
        encoding = data.encoding or 'webp',
        maxWidth = data.maxWidth or 1280,
        maxHeight = data.maxHeight or 720,
    }, function(image)
        finishPending(reqId, 200, { success = true, image = image })
    end, 'base64')
end

SetHttpHandler(function(req, res)
    local route = routes[req.method .. ' ' .. (req.path:gsub('%?.*$', ''))]
    if not route then return sendJson(res, 404, { error = 'Unknown endpoint ' .. req.method .. ' ' .. req.path }) end
    if not authorized(req, res) then return end
    if req.method == 'GET' then return route(req, res) end
    req.setDataHandler(function(body)
        route(req, res, json.decode(body or '') or {})
    end)
end)

RegisterNetEvent('ai_dev_bridge:server:clientResult', function(reqId, ok, result, ms)
    local p = pending[reqId]
    if not p or tostring(source) ~= tostring(p.target) then return end -- only the targeted client may answer
    finishPending(reqId, 200, { success = ok, result = ok and result or nil, error = not ok and result or nil, executionTimeMs = ms })
end)

print('^2[ai_dev_bridge]^7 ready at /ai_dev_bridge/* (localhost only, needs convar ai_bridge_token)')
