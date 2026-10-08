fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ai_dev_bridge'
description 'DEV ONLY: localhost HTTP bridge for the FiveM AI MCP (server/client Lua eval, console buffer, screenshots)'
version '1.1.0'

shared_script 'shared/serialize.lua'
server_script 'server/main.lua'
client_scripts { 'client/main.lua', 'client/inspect.lua' }
