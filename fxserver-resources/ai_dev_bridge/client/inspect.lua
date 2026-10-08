-- Entity inspector for the MCP `inspect_entities` tool: lists entities around the player and
-- draws a native text label on each one (so a game screenshot shows which entity is which).
local POOLS = { vehicle = 'CVehicle', ped = 'CPed', object = 'CObject' }
local overlay = { untilTime = 0, items = {} }

-- top of the model, so the label floats above the entity instead of inside it
local function anchor(ent)
    local _, max = GetModelDimensions(GetEntityModel(ent))
    return GetEntityCoords(ent) + vector3(0.0, 0.0, max.z + 0.25)
end

local function describe(ent, kind)
    local model = GetEntityModel(ent)
    local d = {
        type = kind,
        entity = ent,
        netId = NetworkGetEntityIsNetworked(ent) and NetworkGetNetworkIdFromEntity(ent) or nil,
        model = model,
        heading = GetEntityHeading(ent),
    }
    if kind == 'vehicle' then
        d.modelName = GetDisplayNameFromVehicleModel(model):lower()
        d.plate = GetVehicleNumberPlateText(ent)
        d.playerInside = IsPedInVehicle(PlayerPedId(), ent, false) or nil
    elseif kind == 'ped' and IsPedAPlayer(ent) then
        local idx = NetworkGetPlayerIndexFromPed(ent)
        d.isPlayer = true
        d.playerServerId = GetPlayerServerId(idx)
        d.playerName = GetPlayerName(idx)
    end
    return d
end

local function labelText(item)
    return ('[%d] %s~n~ent %d  net %s~n~%.1f, %.1f, %.1f'):format(
        item.label, item.modelName or item.type, item.entity, item.netId or '-',
        item.coords.x, item.coords.y, item.coords.z)
end

local function drawLabel(x, y, text)
    SetTextFont(4) -- font 0 renders "-" almost invisibly, which breaks negative coords
    SetTextScale(0.0, 0.38)
    SetTextColour(255, 230, 80, 255)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end

CreateThread(function()
    while true do
        if GetGameTimer() < overlay.untilTime then
            for _, item in ipairs(overlay.items) do
                if DoesEntityExist(item.entity) then
                    local p = anchor(item.entity)
                    local onScreen, x, y = GetScreenCoordFromWorldCoord(p.x, p.y, p.z)
                    if onScreen then drawLabel(x, y, item.text) end
                end
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

-- opts: { types = {'vehicle','ped'}, radius = 30, max = 8, durationMs = 8000 }
-- durationMs = 0 clears the overlay. Screen coords are normalized (0..1, origin top-left).
function AiBridgeInspect(opts)
    opts = opts or {}
    local radius, max = opts.radius or 30.0, opts.max or 8
    local me = PlayerPedId()
    local myPos = GetEntityCoords(me)
    local found = {}
    for _, kind in ipairs(opts.types or { 'vehicle', 'ped' }) do
        local pool = POOLS[kind]
        if not pool then error('unknown entity type ' .. tostring(kind)) end
        for _, ent in ipairs(GetGamePool(pool)) do
            if ent ~= me then
                local dist = #(GetEntityCoords(ent) - myPos)
                if dist <= radius then found[#found + 1] = { ent = ent, kind = kind, dist = dist } end
            end
        end
    end
    table.sort(found, function(a, b) return a.dist < b.dist end)

    local items, centerLabel, bestCenter = {}, nil, math.huge
    for i = 1, math.min(#found, max) do
        local f = found[i]
        local item = describe(f.ent, f.kind)
        local c = GetEntityCoords(f.ent)
        local p = anchor(f.ent)
        local onScreen, sx, sy = GetScreenCoordFromWorldCoord(p.x, p.y, p.z)
        item.label = i
        item.distance = f.dist
        item.coords = { x = c.x, y = c.y, z = c.z }
        item.onScreen = onScreen == true or onScreen == 1 -- natives return 1/false
        onScreen = item.onScreen
        item.screen = onScreen and { x = sx, y = sy } or nil
        -- onScreen only means "inside the view frustum"; it can still be behind a wall
        local los = HasEntityClearLosToEntity(me, f.ent, 17)
        item.lineOfSight = los == true or los == 1
        item.text = labelText(item)
        if onScreen then
            local d = (sx - 0.5) ^ 2 + (sy - 0.5) ^ 2
            if d < bestCenter then bestCenter, centerLabel = d, i end
        end
        items[#items + 1] = item
    end

    local duration = opts.durationMs or 8000
    overlay.items = items
    overlay.untilTime = duration > 0 and GetGameTimer() + duration or 0

    local player = {
        serverId = GetPlayerServerId(PlayerId()),
        name = GetPlayerName(PlayerId()),
        coords = { x = myPos.x, y = myPos.y, z = myPos.z },
        heading = GetEntityHeading(me),
    }
    local myVeh = GetVehiclePedIsIn(me, false)
    if myVeh ~= 0 then player.vehicleEntity = myVeh end

    local w, h = GetActiveScreenResolution()
    local out = {}
    for _, item in ipairs(items) do
        local copy = {}
        for k, v in pairs(item) do if k ~= 'text' then copy[k] = v end end
        out[#out + 1] = copy
    end

    -- exact numbers as text: reading coords off a screenshot is unreliable
    local report = AiBridgeInspectReport(player, out, centerLabel, radius, #found)
    for line in report:gmatch('[^\n]+') do print('[inspect] ' .. line) end -- also in F8 / CitizenFX log
    return { report = report, player = player, items = out, centerLabel = centerLabel,
             totalInRadius = #found, screenResolution = { w = w, h = h }, overlayMs = duration }
end

local function xyz(c) return ('%.2f, %.2f, %.2f'):format(c.x, c.y, c.z) end

function AiBridgeInspectReport(player, items, centerLabel, radius, total)
    local lines = {
        ('PLAYER id %d "%s"  pos %s  heading %.1f%s'):format(player.serverId, player.name, xyz(player.coords), player.heading,
            player.vehicleEntity and ('  in vehicle ent %d'):format(player.vehicleEntity) or ''),
        ('%d entities within %.0fm, showing %d (closest first)%s'):format(total, radius, #items,
            centerLabel and ('; in front (closest to screen centre): [%d]'):format(centerLabel) or '; none on screen'),
    }
    for _, it in ipairs(items) do
        local extra = {}
        if it.plate then extra[#extra + 1] = 'plate ' .. it.plate:gsub('%s+$', '') end
        if it.playerInside then extra[#extra + 1] = 'PLAYER INSIDE' end
        if it.onScreen and not it.lineOfSight and not it.playerInside then extra[#extra + 1] = 'BLOCKED (no line of sight)' end
        if it.isPlayer then extra[#extra + 1] = ('player id %s "%s"'):format(tostring(it.playerServerId), tostring(it.playerName)) end
        lines[#lines + 1] = ('[%d] %s %s  dist %.2fm  pos %s  heading %.1f  ent %d  net %s  screen %s%s'):format(
            it.label, it.type, it.modelName or ('model ' .. it.model), it.distance, xyz(it.coords), it.heading,
            it.entity, it.netId or '-', it.screen and ('%.3f,%.3f'):format(it.screen.x, it.screen.y) or 'off-screen',
            #extra > 0 and ('  ' .. table.concat(extra, '  ')) or '')
    end
    return table.concat(lines, '\n')
end
