#!/bin/sh
# Configura o rae para rodar sem interface (Playwright MCP grava HAR, sem precisar de Chrome aberto).
set -e
mkdir -p "$HOME/.reverse-api"
if [ ! -f "$HOME/.reverse-api/config.json" ]; then
  cat > "$HOME/.reverse-api/config.json" <<EOF
{
  "agent_provider": "auto",
  "sdk": "${RAE_SDK:-claude}",
  "claude_code_model": "${RAE_MODEL:-claude-sonnet-5-5}",
  "output_language": "python",
  "real_time_sync": false
}
EOF
fi
exec python -m worker.server
