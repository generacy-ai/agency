# Contract: Subagent-Boundary Code Review (Sub-branch A of fused step 3)

**Feature**: 390-found-during-cockpit-v1
**Target**: `packages/claude-plugin-cockpit/commands/review.md`, step 3 sub-branch A (`--gate implementation-review`)

This is a **structural contract** on the shape of one sub-branch of one playbook step. The consumers are Claude at runtime (interpreting the playbook, invoking the Agent tool, parsing the return) and human reviewers (verifying the contract via grep + reading). It layers on top of #388's `contracts/fused-step.md` — the outer fused step and the shared `AskUserQuestion` convergence are unchanged; only sub-branch A's mechanism changes.

---

## C.0 — Scope

Applies to `--gate implementation-review` only. Sub-branch B (`--gate ∈ {spec-review, clarification-review, plan-review, tasks-review}`) is unchanged from #388 and out of scope for this contract. The shared `AskUserQuestion` convergence at the tail of step 3 (C.5 of #388) is unchanged and out of scope for this contract.

## C.1 — Subagent invocation shape

Sub-branch A opens by invoking the Agent tool. The invocation MUST have this shape:

- `subagent_type`: `"general-purpose"` — **fixed, unconditional** (FR-001, Q2=A). No `code-reviewer` preference. No capability probing. No fallback branch in the playbook.
- `description`: a short 3–5 word phrase (e.g., `"Code review PR #<n>"`), consistent with the Agent tool's `description` field convention.
- `prompt`: the review-scope prompt (see C.2). This is the only content the sub-turn sees; the parent's shared context is not passed through.

The Agent tool call is the **only** step-3-A operation the parent performs before parsing the return. No `gh` calls, no `/code-review` invocation, no file reads inside the parent turn between step 2 (pre-flight) and the Agent tool call.

**Verifier**: `review.md`'s step 3 sub-branch A contains an instruction to invoke the Agent tool with `subagent_type: "general-purpose"` (greppable phrase — anchor chosen at implementation time; suggested anchor: the literal string `subagent_type: "general-purpose"`).

## C.2 — Subagent prompt content (review scope + return contract)

The Agent tool's `prompt` argument MUST carry, at minimum:

1. **PR reference** — the parent resolves the epic's open PR (via the existing `generacy` CLI / `gh` shape used elsewhere in the playbook) and passes only the reference as `<owner>/<repo>#<n>`. The parent does NOT fetch the diff (Q4=B, FR-002).
2. **Fetch instruction** — the sub-turn is instructed to run `gh pr diff <owner>/<repo>#<n>` itself and to read any surrounding files or run bounded verification (e.g. `node -e` repros) it deems necessary to arrive at empirically verified findings.
3. **Verify-before-report** — the sub-turn MUST empirically verify each finding before reporting it. Speculative findings are not permitted.
4. **Findings schema** — each finding is a JSON object with exactly four fields:
   - `file` — the path relative to the repo root (string).
   - `line` — the 1-indexed line number the finding anchors on (integer).
   - `summary` — a one-line human-readable description of the finding (string).
   - `failure_scenario` — a one-to-three-sentence description of the concrete failure mode the finding would produce in a real execution (string).
5. **Return contract** — quoted from C.3 below verbatim (the sub-turn's terminal instruction is defined by the parent's prompt, not by any sub-skill's own contract).

The prompt SHOULD NOT invoke any slash command (including `/code-review`) — the sub-turn's contract lives in the prompt itself, and the sub-turn is a `general-purpose` agent, so it does not have automatic access to plugin slash commands. If the sub-turn is instructed to call another slash command, the collision this feature exists to prevent would return.

## C.3 — Subagent return contract (strict JSON boundary)

The subagent's **entire return message** MUST be a single JSON value, of exactly one of these two shapes:

**Shape A (findings)** — a JSON array:

```json
[
  {"file": "<path>", "line": <int>, "summary": "<one-line>", "failure_scenario": "<one-to-three sentences>"},
  ...
]
```

An empty array `[]` denotes zero findings — the sub-turn ran the review and found nothing to report. This is a valid non-error return.

**Shape B (hard error)** — a JSON object:

```json
{"error": "<description of what went wrong>"}
```

Used when the sub-turn cannot produce findings — e.g., `gh pr diff` fails, the PR reference resolves to no PR, or an unrecoverable tool error inside the sub-turn.

**No other content**. No prose wrapper. No fenced code block (`\`\`\`json ... \`\`\``). No leading or trailing whitespace beyond what JSON allows. No conversational preamble or postscript. This is the entire return message.

**Rationale**: strict JSON boundary eliminates the ambiguous-output failure class this issue exists to remove (raw-JSON-in-prose leaked from `/code-review`'s terminal contract into the parent's context). Two shapes, both machine-checkable; anything else fails loud.

**Verifier (spec-side, in the parent playbook prose)**: the playbook contains the phrases:
- "single JSON value" (or equivalent).
- The four-field schema names `{file, line, summary, failure_scenario}` verbatim.
- The error shape `{"error": "<description>"}` verbatim.
- The prohibition on prose wrappers or fenced blocks.

## C.4 — Parent mapping (four-way branch on subagent return)

Immediately after the subagent returns, the parent parses the return message as JSON and branches:

| Subagent return | Parent branch | Behavior |
|-----------------|---------------|----------|
| Non-empty JSON array of `{file, line, summary, failure_scenario}` | Findings-table | Continue into C.5 (findings rendering) then #388's shared `AskUserQuestion` convergence. |
| `[]` (empty JSON array) | Zero-findings | Render the `\| (none) \| \| \| \|` row per #388 C.3.5; `Suggested decision: approve`; still invoke `AskUserQuestion` (assist-mode contract preserved). |
| `{"error": "<description>"}` (parseable object with `error` string) | Hard-error | Route to Error handling block, class `OTHER`. Do NOT invoke `AskUserQuestion`. Do NOT emit any Terminal Outcome Check marker. |
| Anything else (parse error, other JSON shape, extra fields) | Hard-error | Same as above, class `OTHER`. Include the raw return message quoted inside the fenced code block of the class-`OTHER` output. |

**Rationale**: zero-findings and hard-error map onto #388's existing branches — no new terminal state introduced (FR-005). Unparseable / other-shape returns are treated as hard errors to prevent silent shape drift (Q3=A refined's motivating concern).

**Verifier (spec-side, in the parent playbook prose)**: the playbook contains a mapping table (or equivalent enumerated prose) covering all four cases.

## C.5 — Findings rendering (unchanged from #388 C.3.5)

For the non-empty-array branch, the parent:

1. **Classifies each finding** as `Blocking? Yes` (correctness / security / data-integrity failure scenario) or `Blocking? No` (style / simplification / nit) — Claude's judgment, on the parsed array. The subagent does not carry a blocking marker; classification is the parent's responsibility, so the operator can override at the gate.
2. **[Inline text — MUST appear on this line, immediately before the table rendering instruction]** `MUST NOT print raw JSON under any circumstance.` If the subagent's structured return were restated verbatim in the response body, that would be a defect. Render the summary table.
3. Renders the findings-summary table as **prose in the response body**:

   ```markdown
   | # | File:line | Finding | Blocking? |
   |---|-----------|---------|-----------|
   | 1 | <path>:<line> | <one-line finding summary> | Yes | No |
   ```

4. Appends a `Suggested decision: <approve|request-changes|abort>` line:
   - Any `Yes` in `Blocking?` → `request-changes`.
   - All `No` (findings present, none blocking) → `approve`.
5. Converges into #388's C.5 shared `AskUserQuestion` invocation, in the same response.

## C.6 — Governance surface amendment (README.md line 7)

`packages/claude-plugin-cockpit/README.md`'s overview paragraph MUST be amended:

- **Removed**: the substring `single documented exception` (and the parenthetical it introduces about `/cockpit:review --gate implementation-review` invoking `/code-review`).
- **Added**: a sentence stating that cross-command composition happens via the Agent tool (subagent boundary); no slash command is invoked inline in another command's shared context.
- **Added**: a one-line rationale referencing `#390` and the two prior recurrences (`#384`, `#388`).

Illustrative shape (final wording is chosen at implementation time within these constraints):

> There are no dependencies on `specs/**` contracts, no autonomy-policy lookup, and no cross-slash-command invocation. Cross-command composition uses the Agent tool (subagent boundary); a slash command is never invoked inline in another command's shared context (see #390 for the recurrence pattern this rule closes, following #384 and #388).

**Verifiers**:
- `grep -c "single documented exception" packages/claude-plugin-cockpit/README.md` → `0`.
- A greppable anchor phrase from the new wording is chosen at implementation time (suggested: `Cross-command composition`) — that phrase appears exactly once.
- `#390` appears in the amended paragraph (or an immediately adjacent line).

---

## Non-normative examples (informative)

### Example 1 — normal implementation-review flow (3 findings, 1 blocking)

The parent's turn after subagent return looks like:

```
[Agent tool call summary — the harness shows this]

[subagent returned; parent parses]

MUST NOT print raw JSON under any circumstance.

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | lib/validation.ts:42 | Missing null check on config.host | Yes |
| 2 | lib/util.ts:15 | Prefer const over let | No |
| 3 | lib/util.ts:33 | Unused import | No |

Suggested decision: request-changes

[AskUserQuestion tool call in the SAME response, options: approve / request-changes / abort]
```

The subagent's return (visible in the transcript as the Agent tool result — NOT restated in the parent's prose):

```json
[
  {"file": "lib/validation.ts", "line": 42, "summary": "Missing null check on config.host", "failure_scenario": "When config.host is undefined, the URL parse crashes with a TypeError before the caller can produce a friendly error, aborting the request."},
  {"file": "lib/util.ts", "line": 15, "summary": "Prefer const over let for immutable binding", "failure_scenario": "None — style-only observation."},
  {"file": "lib/util.ts", "line": 33, "summary": "Unused import 'fs/promises'", "failure_scenario": "None — dead code."}
]
```

### Example 2 — zero-findings implementation-review

Parent's turn:

```
[Agent tool call summary]

MUST NOT print raw JSON under any circumstance.

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve

[AskUserQuestion tool call in the SAME response]
```

Subagent return: `[]`.

### Example 3 — subagent hard error

Parent's turn:

```
[Agent tool call summary]

CLI failed with exit code 1.
```
```
gh pr diff <owner>/<repo>#<n> failed: 404 Not Found. The referenced PR does not exist or is inaccessible with current credentials.
```

**No `AskUserQuestion` call. No `Labels:` / `Feedback posted:` / `Aborted:` marker.** Class `OTHER`.

Subagent return: `{"error": "gh pr diff <owner>/<repo>#<n> failed: 404 Not Found. ..."}`.

### Example 4 — unparseable subagent return

Parent's turn:

```
[Agent tool call summary]

CLI failed with exit code 1.
```
```
Subagent return could not be parsed as the required JSON shape. Raw:
Well, I looked at the PR and I think there's a bug in lib/validation.ts around line 42...
```

Parent's mapping applied the "anything else" branch of C.4 — the subagent violated the return contract by returning prose. Class `OTHER`.

---

## Anti-patterns (each is a CONTRACT VIOLATION)

**AP-1** — The parent's turn contains an inline `/code-review` invocation (no Agent tool boundary). This is the pre-#390 shape and the reintroduction of the contract collision. C.1 / C.2 violation.

**AP-2** — The Agent tool's `subagent_type` is not `"general-purpose"` (e.g., `code-reviewer`, or a per-environment branch). C.1 violation; Q2=A rejection.

**AP-3** — The subagent's return contains prose above or below the JSON, or wraps the JSON in a fenced code block. C.3 violation; Q3=A refined rejection. If the parent parses tolerantly, that is a compounding violation of C.4.

**AP-4** — The parent restates the subagent's structured return verbatim in the response body (raw JSON in the parent's prose). C.5 step 2 violation; #388's retained clause defense-in-depth failed.

**AP-5** — Zero-findings (`[]`) auto-approves without invoking `AskUserQuestion`. C.4 violation; smuggles the deferred autonomy policy.

**AP-6** — Hard-error (`{"error":…}` or unparseable) still invokes `AskUserQuestion`. C.4 violation; manufactures consent from an empty analysis.

**AP-7** — The parent inlines the PR diff into the Agent prompt (parent runs `gh pr diff` itself). C.2 violation; Q4=B rejection (silently caps sub-turn at diff-only reading).

**AP-8** — The subagent prompt instructs the sub-turn to invoke `/code-review` (or any other slash command). C.2's intent violation; reintroduces the contract collision inside the sub-turn.

**AP-9** — The playbook adds a third "MUST" clause, a checklist, or a terminal-outcome extension beyond what #384/#388 shipped, as a hedge against isolation not working. SC-007 violation. If isolation fails, that is a new observed defect and a new issue.

**AP-10** — `README.md` retains the "single documented exception" phrase, or omits the subagent-boundary replacement wording, or the amended paragraph does not reference `#390`. C.6 violation; SC-005 failure.

**AP-11** — `specs/372-epic-generacy-ai-tetrad/plan.md` is edited on this branch. SC-006 violation; Q1=B rejection.

**AP-12** — Sibling cockpit playbook (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) is edited on this branch. C11 (data-model) / FR-007 violation.
