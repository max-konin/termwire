#!/usr/bin/env bash
# Verifies that the built packages run on Node, not just on Bun.
# The published CLI and MCP server must never depend on Bun APIs or on
# extensionless ESM imports, both of which Node rejects.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli="$root/packages/cli/dist/bin/termwire.js"
mcp="$root/packages/mcp/dist/bin/termwire-mcp.js"

for artifact in "$cli" "$mcp"; do
  if [ ! -f "$artifact" ]; then
    echo "missing build artifact: $artifact" >&2
    echo "run 'bun run build' first" >&2
    exit 1
  fi
done

echo "node $(node --version)"

echo "--- cli: help"
node "$cli" --help | grep -q "open \[options\] <target>"

echo "--- cli: version"
# Guards the runtime package.json lookup, which resolves differently from dist.
expected="$(node -p "require('$root/packages/cli/package.json').version")"
actual="$(node "$cli" --version)"
if [ "$actual" != "$expected" ]; then
  echo "unexpected CLI version: $actual (expected $expected)" >&2
  exit 1
fi

echo "--- cli: install help and prompt module"
# Captured rather than piped: `grep -q` closes the pipe early and Node reports EPIPE.
help="$(node "$cli" install --help)"
case "$help" in
  *"--layout <name>"*) ;;
  *) echo "install help is missing --layout" >&2; exit 1 ;;
esac
# The prompt module is imported lazily at runtime, so load it explicitly: a Bun-only
# or extensionless import inside it would otherwise only fail for a user.
node --input-type=module -e "await import('$root/packages/cli/dist/install-prompt.js')"

echo "--- cli: the skill ships and resolves from dist"
node --input-type=module -e "
  const { skillSourcePath } = await import('$root/packages/cli/dist/skill.js');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(skillSourcePath(), 'utf8');
  if (!text.includes('termwire open')) throw new Error('skill file is not the skill');
"

echo "--- cli: install refuses to guess without a terminal"
actual="$(node "$cli" install < /dev/null 2>&1 || true)"
case "$actual" in
  *"pass --yes, --layout or --agents"*) ;;
  *) echo "unexpected install output: $actual" >&2; exit 1 ;;
esac

echo "--- cli: loads the nvim and tmux adapters"
actual="$(env -u TERMWIRE_SOCKET node "$cli" open README.md 2>&1 || true)"
case "$actual" in
  "termwire: not inside a termwire workspace") ;;
  *) echo "unexpected CLI output: $actual" >&2; exit 1 ;;
esac

echo "--- mcp: initialize and list tools"
request='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
response="$(printf '%s\n' "$request" | node "$mcp")"
echo "$response" | grep -q '"name":"termwire"'
echo "$response" | grep -q '"name":"termwire_open"'

echo "node verification passed"
