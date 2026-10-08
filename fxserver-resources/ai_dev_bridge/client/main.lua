-- ai_dev_bridge: runs Lua sent by the server bridge (only the server can trigger this event)
RegisterNetEvent('ai_dev_bridge:client:eval', function(reqId, code)
    local ok, result, ms = AiBridgeEval(code, '=ai_eval_client', GetGameTimer)
    -- ponytail: plain net event, use TriggerLatentServerEvent if results ever exceed a few KB
    TriggerServerEvent('ai_dev_bridge:server:clientResult', reqId, ok, result, ms)
end)
