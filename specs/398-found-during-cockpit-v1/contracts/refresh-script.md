# Contract: `scripts/refresh-help-snapshots.sh` (Q1=A refresh mechanism)

Structural contract for the repo-local shell script that regenerates the checked-in `--help` snapshot files, discharging the Q1=A sync obligation.

## File location

```
packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
```

## Shebang and executable bit

- **Shebang**: `#!/usr/bin/env bash` (portable across the repository's Linux/macOS/WSL environments).
- **Executable bit**: `chmod +x` at commit time (verified by static-check `test -x scripts/refresh-help-snapshots.sh`).

## Invocation

```bash
# From the repository root:
bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh

# Or, if executable and the script cwd's itself:
packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
```

The script MUST be safe to run from any cwd (it computes its own resolve paths from `$0` or `${BASH_SOURCE[0]}`).

## Behavior (step-by-step)

### Step 1 — Pre-flight

Check that `generacy` is on `$PATH`:

```bash
if ! command -v generacy >/dev/null 2>&1; then
  echo "error: generacy CLI not on \$PATH" >&2
  echo "" >&2
  echo "Refresh must run inside a cluster session (add /shared-packages/node_modules/.bin to PATH)" >&2
  echo "or after: npm install -g @generacy-ai/generacy" >&2
  exit 1
fi
```

### Step 2 — Compute paths

Resolve the plugin package root and the target directory:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMANDS_DIR="$PLUGIN_ROOT/commands"
SNAPSHOTS_DIR="$PLUGIN_ROOT/tests/fixtures/help-snapshots"

mkdir -p "$SNAPSHOTS_DIR"
```

### Step 3 — Enumerate distinct verbs

Grep `commands/*.md` for `generacy cockpit <verb>` (matching both fenced and inline occurrences), extract the third token, dedupe:

```bash
VERBS="$(grep -hoE 'generacy cockpit [a-z][a-z-]*' "$COMMANDS_DIR"/*.md \
         | awk '{print $3}' \
         | sort -u)"

if [ -z "$VERBS" ]; then
  echo "error: no 'generacy cockpit <verb>' invocations found in $COMMANDS_DIR" >&2
  exit 1
fi
```

### Step 4 — Capture CLI version

```bash
CLI_VERSION="$(generacy --version 2>&1)"
if [ -z "$CLI_VERSION" ] || [[ "$CLI_VERSION" == *"error"* ]]; then
  echo "error: could not capture generacy --version: $CLI_VERSION" >&2
  exit 1
fi
```

### Step 5 — Refresh each snapshot

For each distinct verb, capture `generacy cockpit <verb> --help`, prefix the version tag, write to the snapshot file:

```bash
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
```

The `NO_COLOR=1` environment variable suppresses ANSI escape codes in the CLI's output. If a specific CLI verb doesn't respect `NO_COLOR`, an alternative is to pipe through `sed 's/\x1b\[[0-9;]*m//g'` — but the default assumption is that the CLI respects the widely-adopted `NO_COLOR` convention.

### Step 6 — Print summary and exit

```bash
echo "Refreshed $COUNT snapshots from generacy --version $CLI_VERSION"
echo "Snapshots at: $SNAPSHOTS_DIR"
exit 0
```

## Non-goals

- **Does NOT run in CI.** The script is operator-triggered inside a cluster session where the CLI always exists. CI reads the checked-in snapshots; it doesn't refresh them. This is the Q1=A decoupling.
- **Does NOT modify `commands/*.md`.** The script is snapshot-only. Playbook edits are the operator's responsibility, informed by the audit's mismatch reports after refresh.
- **Does NOT auto-delete stale snapshots.** If a verb is removed from all playbooks, the operator manually deletes the corresponding `<verb>.txt` file. Auto-deletion could mask an accidental playbook edit that removed a verb reference.
- **Does NOT commit or push.** The script writes files; the operator commits.

## Verifier

**Static** — file exists and is executable:

```bash
test -x packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
```

**Runtime** (executed during smoke sessions, not CI):

```bash
# 1. Run the script.
bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh

# 2. Confirm each snapshot file has the version-tag header.
for f in packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/*.txt; do
  head -1 "$f" | grep -q '^# captured from: generacy --version ' \
    || { echo "missing version tag: $f"; exit 1; }
done

# 3. Run the audit — should be green if the playbook matches the fresh snapshots.
pnpm --filter claude-plugin-cockpit test
```

## Failure modes

**Script run in an environment without `generacy` on `$PATH`**: script exits 1 with a clear error and installation guidance. No snapshot files touched.

**Script run against a CLI version where `--help` output is malformed** (e.g., a preview version with a broken `--help`): the malformed output is written to the snapshot file verbatim; the audit's `parseSnapshotUsageArgTokens` throws when it can't find the usage line, and the test reports the error. Fix: install a working CLI version and re-refresh.

**Script's enumeration step misses a verb** (e.g., a new playbook uses a verb the grep regex doesn't match): no snapshot is written for the missing verb; the audit fails 398-1 with `<no snapshot for verb '<verb>'>`. Fix: extend the grep regex or add the verb to the enumeration set explicitly.

**Script writes a snapshot with CRLF line endings** (e.g., on Windows): the audit's parser splits on `\n` and may leave trailing `\r` on tokens, causing exact-match failures. Fix: the script MUST normalize line endings to LF (the Bash `>` redirection on Linux/macOS does this automatically; on WSL/Windows-Bash, add `| tr -d '\r'` if the CLI emits CRLF).

## Coordination with the audit

The refresh script and the audit are two halves of the same drift-detection loop:

1. Operator runs smoke session; audit reports mismatch on `commands/foo.md` for verb `bar`.
2. Operator runs the refresh script; snapshots are regenerated (including a possibly-updated `bar.txt`).
3. Operator either:
   - Updates `commands/foo.md` to match the new `bar.txt` if the CLI's `--help` genuinely changed the token — playbook follows contract.
   - Reverts `bar.txt` to the previous state (via `git checkout HEAD~ -- tests/fixtures/help-snapshots/bar.txt`) if the CLI change was unintended — flag to the engine team.

Either way, the loop closes with the playbook and the snapshot in agreement, and the audit passes.

## Precedent match

This is the same-shape mechanism as #396's `lib/gate-vocabulary.ts` sync obligation, at a different data type:

- **#396**: `gate-vocabulary.ts` is a plugin-local declared vocabulary of `waiting-for:*` labels; sync is manual (edit the file when upstream changes).
- **#398**: `help-snapshots/<verb>.txt` are plugin-local declared CLI contracts; sync is script-mediated (run `refresh-help-snapshots.sh` when the CLI changes).

The script exists because `--help` output is opaque enough that hand-editing snapshots is error-prone; the vocabulary list is short enough that hand-editing is safe. Same class of solution, different tooling based on the data's shape.
