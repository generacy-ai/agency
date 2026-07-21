# Contract: Form 4 invocation parsing

Extension of the pre-existing invocation-forms contract at `specs/416-operator-requested-capability/contracts/invocation-forms.md`. This contract is authoritative for Form 4's argument-parsing surface only; Forms 1–3 remain governed by #416.

## C1 — Extended usage string

The literal usage-error string printed by `/cockpit:auto` extends to:

```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>

  <epic-ref>    owner/repo#N — epic-mode container issue
  <issue-ref>   owner/repo#N — existing tracking issue
  <issue-list>  one or more issue references (bare `N` or qualified `owner/repo#N`),
                comma- and/or whitespace-separated. Bare numbers resolve against the
                workspace repo's git origin. Examples:
                  /cockpit:auto 223
                  /cockpit:auto 223, 224, 226
                  /cockpit:auto 223 other/repo#41
```

The `Usage:` header line is pinned by test 444-2 (see R10). The examples and prose block below it are informational and NOT pinned.

## C2 — Token splitting

**Rule**: `rawArguments.split(/[,\s]+/).filter(t => t.length > 0)`.

**Consequences**:
- Any run of commas + whitespace is one separator. `"512,513"`, `"512 513"`, `"512, 513"`, `"512,  , 513"` all split to `["512", "513"]`.
- Trailing/leading separators produce no tokens.
- Interior empty tokens (`512,,513`) collapse to nothing (Q5=A).
- Zero non-empty tokens after splitting → usage error (`isEmpty` boundary).

**Non-goals**: quote handling (Form 3's `--new "<title>"` is parsed by the harness's argument tokenizer; Form 4 never sees quoted content).

## C3 — Flag detection

Recognized flags: `--tracking`, `--new`. Both consume the next positional as their argument (matching Forms 2/3 semantics from #416).

**Unknown flags** (any other `--*` token, including typos like `--tracing`): usage error with reason `unknown-flag`. Do NOT try to guess intent.

## C4 — Form dispatch table

See E3 in `data-model.md` for the canonical decision order. Reproduced here as a decision table for review:

| `flags.tracking` | `flags.new` | `flags.unknown` | Positional shape | Form | Reason on error |
|:-:|:-:|:-:|---|---|---|
| — | — | `≥1` | — | usage-error | `unknown-flag` |
| ✓ | ✓ | — | — | usage-error | `both-flags` |
| ✓ | ✗ | — | exactly one `owner/repo#N` | tracking-existing | — |
| ✓ | ✗ | — | anything else | usage-error | `tracking-arg-shape` |
| ✗ | ✓ | — | exactly one quoted title | tracking-new | — |
| ✗ | ✓ | — | anything else | usage-error | `new-arg-shape` |
| ✗ | ✗ | — | zero non-empty tokens | usage-error | `empty` |
| ✗ | ✗ | — | exactly one `owner/repo#N` | **epic** | — |
| ✗ | ✗ | — | anything else (bare N, mixed, multi) | **tracking-list** | — |

**Ordering note**: `flags.unknown` is checked first because it's the most common typo class and its diagnostic is the most actionable. `both-flags` next because it's structurally impossible to satisfy any real form.

## C5 — Bare-number resolution

**Prerequisite**: `WorkspaceRepo` must be resolvable (see contract `contracts/tracking-issue-reuse.md § R1 workspace resolution`). This step runs after `WorkspaceRepo` succeeds; if it fails, Form 4 exits before resolution begins.

**Per-token rule**:
- Token matches `^\d+$` → `{ owner: workspace.owner, repo: workspace.repo, number: parseInt(token), supplied: "bare" }`.
- Token matches `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+#\d+$` → `{ owner, repo, number, supplied: "qualified" }` (parse the three capture groups directly).
- Anything else → construction error. Diagnostic: `Cannot parse ref token: <token>. Expected bare integer (e.g. 512) or qualified reference (e.g. owner/repo#512).`

**Owner/repo character class**: GitHub allows `[A-Za-z0-9._-]` for both owner and repo names. The regex above matches; more restrictive validation is unnecessary (bad names surface at the E7 `gh api` probe as 404s).

## C6 — Dedup

After per-token resolution, dedup the `QualifiedRef[]` in first-seen order using tuple equality (`owner`, `repo`, `number`). Q3=A pins this rule: silent dedup, no operator diagnostic.

**Reference implementation** (matches `lib/invocation-form-4.ts` export):

```ts
function dedupInFirstSeenOrder(refs: QualifiedRef[]): QualifiedRef[] {
  const seen = new Set<string>();
  const out: QualifiedRef[] = [];
  for (const ref of refs) {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
```

## C7 — Startup ordering guarantee

Form 4's parse + resolution + validation + reuse-detection ALL run BEFORE any state-changing action:
- No `gh issue create` fires until (a) parse succeeds, (b) workspace repo resolves, (c) all refs validate, (d) reuse detection returns "no candidate".
- No ledger directory is created until Form 4's outcome is known — matches Form 3's pattern where the ledger header waits for G.6 approval.
- The reuse-notice print (R3) OR the standard startup line (Forms 1/2 shape) happen in that order once the tracking ref is known.

## C8 — Backward-compat guarantee

Every input that succeeded under pre-#444 auto.md succeeds under Form 4 with identical form binding:
- `/cockpit:auto owner/repo#123` → still Form 1 (epic).
- `/cockpit:auto --tracking owner/repo#123` → still Form 2.
- `/cockpit:auto --new "some title"` → still Form 3.

Every input that produced a usage error under pre-#444 auto.md EITHER:
- Still produces a usage error (e.g., `--tracking --new`, unknown flags), OR
- Now succeeds under Form 4 (e.g., `123`, `123 456`, `123 owner/repo#41`) — this is the intentional expansion.

No input's meaning changes silently.
