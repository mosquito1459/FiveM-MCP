-- Turns eval results into something json/msgpack can carry (vectors, nested tables, functions).
function AiBridgePlain(v, depth)
    depth = depth or 0
    local t = type(v)
    if t == 'vector2' then return { x = v.x, y = v.y } end
    if t == 'vector3' then return { x = v.x, y = v.y, z = v.z } end
    if t == 'vector4' then return { x = v.x, y = v.y, z = v.z, w = v.w } end
    if t == 'table' then
        if depth > 8 then return '<max depth>' end
        local out = {}
        for k, val in pairs(v) do out[k] = AiBridgePlain(val, depth + 1) end
        return out
    end
    if t == 'function' or t == 'userdata' or t == 'thread' then return tostring(v) end
    return v
end

-- Compiles and runs code; returns ok, result (multiple returns become an array), elapsed ms.
function AiBridgeEval(code, chunkName, clock)
    local fn, compileErr = load(code, chunkName, 't', _G)
    if not fn then return false, 'Compile error: ' .. tostring(compileErr), 0 end
    local start = clock()
    local r = table.pack(pcall(fn))
    local elapsed = clock() - start
    if not r[1] then return false, tostring(r[2]), elapsed end
    if r.n <= 2 then return true, AiBridgePlain(r[2]), elapsed end
    return true, AiBridgePlain({ table.unpack(r, 2, r.n) }), elapsed
end
