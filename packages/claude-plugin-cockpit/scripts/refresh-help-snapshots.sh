#!/usr/bin/env bash
set -euo pipefail

# Refresh `generacy cockpit <verb> --help` snapshot fixtures used by the drift
# audit in tests/playbook-verification.test.ts. Run inside a Generacy cluster
# session where `generacy` is on $PATH; otherwise install with
# `npm install -g @generacy-ai/generacy` first. Never runs in CI (Q1=A).

if ! command -v generacy >/dev/null 2>&1; then
  echo "error: generacy CLI not on \$PATH" >&2
  echo "" >&2
  echo "Refresh must run inside a cluster session (add /shared-packages/node_modules/.bin to PATH)" >&2
  echo "or after: npm install -g @generacy-ai/generacy" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMANDS_DIR="$PLUGIN_ROOT/commands"
SNAPSHOTS_DIR="$PLUGIN_ROOT/tests/fixtures/help-snapshots"

mkdir -p "$SNAPSHOTS_DIR"

VERBS="$(grep -hoE 'generacy cockpit [a-z][a-z-]*' "$COMMANDS_DIR"/*.md \
         | awk '{print $3}' \
         | sort -u)"

if [ -z "$VERBS" ]; then
  echo "error: no 'generacy cockpit <verb>' invocations found in $COMMANDS_DIR" >&2
  exit 1
fi

CLI_VERSION="$(generacy --version 2>&1)"
if [ -z "$CLI_VERSION" ] || [[ "$CLI_VERSION" == *"error"* ]]; then
  echo "error: could not capture generacy --version: $CLI_VERSION" >&2
  exit 1
fi

COUNT=0
for VERB in $VERBS; do
  SNAPSHOT_FILE="$SNAPSHOTS_DIR/$VERB.txt"
  {
    printf '# captured from: generacy --version %s\n' "$CLI_VERSION"
    NO_COLOR=1 generacy cockpit "$VERB" --help 2>&1 || {
      echo "error: 'generacy cockpit $VERB --help' failed (non-zero exit)" >&2
      exit 1
    }
  } > "$SNAPSHOT_FILE"
  COUNT=$((COUNT + 1))
done

echo "Refreshed $COUNT snapshots from generacy --version $CLI_VERSION"
echo "Snapshots at: $SNAPSHOTS_DIR"
exit 0
