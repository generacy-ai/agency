# Clarifications — /cockpit:file

## Batch 1 — 2026-06-29

### Q1: Manifest file
**Context**: The spec refers to "the local manifest" / "the manifest file" as the artifact `/cockpit:file` reads and the one `generacy cockpit manifest sync` writes back to, and FR-009 keys idempotency on "manifest already has issue numbers for every task block." But the spec never names the file, its location relative to `specs/<branch>/`, the format used to express task blocks, or where issue numbers are recorded within a task block. Without this, implementers can't write the "already filed" detector in FR-009, the partial-state recovery in US2-AC3, or the spec.md fallback resolution in FR-002.
**Question**: What file is "the manifest," and how are task blocks and their filed issue numbers expressed within it?
**Options**:
- A: `specs/<branch>/tasks.md` — task blocks are the existing speckit `## Task: <id>` sections; the filed issue number is written into a `**Issue**: #<n>` line in each block, and the parent epic issue is written to a `**Epic**: #<n>` line at the top.
- B: `specs/<branch>/manifest.md` (a new dedicated file separate from `tasks.md`) — task blocks are a flat list of `- <id>: <title>` entries; `manifest sync` rewrites each row in place to `- <id>: #<issue> <title>`, with the parent epic on a header line.
- C: `specs/<branch>/tasks.md` frontmatter — issue numbers are stored as a YAML map (`issues: { T001: 123, ... }, epic: 100`) at the top of `tasks.md`, leaving the task block bodies untouched.

**Answer**: A. The (speckit) manifest is `specs/<branch>/tasks.md`: task blocks are the existing `## Task: <id>` sections; record the filed number as `**Issue**: #<n>` in each block and `**Epic**: #<n>` at the top. Reuses the speckit convention rather than inventing a new file. Note: this is the speckit manifest, distinct from the **epic** manifest `.generacy/epics/<slug>.yaml` that `generacy cockpit manifest sync` (#790) maintains — don't conflate them.

### Q2: Engine handoff between `tasks_to_issues` and `manifest sync`
**Context**: FR-003 has `/cockpit:file` shell out to `agency-spec-kit`'s `tasks_to_issues`; FR-004 then invokes `generacy cockpit manifest sync` and passes "the returned issue numbers." Assumption #2 says `manifest sync` "accepts the `tasks_to_issues` output (or reads from a stable temp location)." The transport between the two engine commands is left to implementer choice, but it determines the error-handling boundary in FR-005/FR-006 and whether a developer can pipe the engines together manually for recovery.
**Question**: How does `/cockpit:file` route the filed-issue payload from `tasks_to_issues` to `manifest sync`?
**Options**:
- A: `tasks_to_issues` emits JSON on stdout; `/cockpit:file` pipes that directly into `manifest sync --stdin`. Failures are detected by exit code; nothing is persisted between the two steps.
- B: `tasks_to_issues` writes a JSON payload to `specs/<branch>/.cockpit-file-result.json` (gitignored); `manifest sync` reads from that path by convention. The file is left on disk after success so a developer can inspect it; `/cockpit:file` deletes it only on a clean success.
- C: `/cockpit:file` captures `tasks_to_issues` stdout to a tempfile under `$TMPDIR` and passes the path to `manifest sync` as `--from <path>`. The tempfile is unlinked when the wrapper exits regardless of outcome.

**Answer**: Via the artifacts, not a JSON pipe. `tasks_to_issues` writes the new issue numbers into `tasks.md` and the epic body checklist; `generacy cockpit manifest sync <epic-ref>` then re-parses the epic body (#790) to update the `.yaml`. This avoids a second transport contract and preserves #790's body-as-source-of-truth. If a direct handoff is ever needed, a tempfile passed as `--from` (Option C) is the fallback — but the artifact path is preferred.

### Q3: Partial re-run reconciliation
**Context**: FR-009 defines the "already filed" no-op as a manifest where every task block has an issue number. US2-AC3 separately requires that "a subsequent successful re-run reconciles the manifest with whatever was already filed, without filing duplicates." Between those two extremes lies the realistic failure case: a previous run filed some children but not all (and may or may not have updated the manifest for the filed ones). The behavior of `/cockpit:file` on such a partial manifest is not specified, and it determines whether developers can recover from a half-finished run by re-running the same command or whether they need a separate recovery flow.
**Question**: When `/cockpit:file` is re-run on a manifest where some — but not all — task blocks already have issue numbers, what does it do?
**Options**:
- A: Files only the task blocks that lack an issue number (skipping already-numbered blocks), reuses the existing parent epic if one is recorded, then runs `manifest sync` to fill in the new numbers. Partial states are recoverable by re-running the same command.
- B: Treats any partial manifest as a hard error: prints "manifest is partially filed; resolve manually before re-running" and exits non-zero. The developer must hand-edit the manifest or use a separate `/cockpit:resync`-style command to recover.
- C: Treats partial == unfiled: files the parent (if missing) and ALL task blocks (creating duplicates for any already-filed ones), then `manifest sync` overwrites all numbers. Simpler implementation but violates US2-AC3 on duplicates.

**Answer**: A. On a partial re-run, file only the task blocks lacking a number, reuse the recorded parent epic, then sync. Partial states recover by re-running the same command — no duplicates (satisfies US2-AC3).

### Q4: Epic argument purpose
**Context**: FR-002 says the command accepts an optional epic argument in three forms (`owner/repo#N`, `#N`, URL) with fallback to the branch's `specs/<branch>/spec.md` `**Epic**:` line. But the spec.md `**Epic**:` line for this very feature points at `generacy-ai/tetrad-development#85` — a parent-of-parent epic in another repo — while Out of Scope explicitly rules out cross-repo filing and says the command files into "whatever repo the current branch's `gh` remote points at." It's unclear what the argument actually overrides: target repo for filing, parent-epic reference recorded in child issues, identity of an already-filed parent on a re-run, or something else.
**Question**: What does the optional epic argument to `/cockpit:file` control?
**Options**:
- A: It is the reference to an *already-existing* parent epic issue. On a re-run after partial filing, the developer passes the parent issue number/URL so the command skips creating a new parent and files only missing children under it. Default (no arg): create a new parent from the manifest.
- B: It is a "parent-of-parent" reference recorded in the new parent epic's body (a `Parent epic: <ref>` link), purely for traceability. It does not change what gets filed or where. Default (no arg): use the spec.md `**Epic**:` line; if neither is set, no parent-of-parent link is recorded.
- C: It is the target-repo override (matching `owner/repo#N` form) — the command files into that repo instead of the current branch's `gh` remote. The `#N` and URL forms only make sense when paired with the owner/repo. (Note: this contradicts the current Out-of-Scope clause; choosing this option also requires updating that section.)

**Answer**: A (with traceability addition). The optional epic arg is an **existing parent epic to reuse** (recovery/idempotency); default creates a new parent. Separately, record the `spec.md` `**Epic**:` line (the meta-epic, e.g. `generacy-ai/tetrad-development#85`) as a `Parent epic:` link in the new parent's body. NOT C — no cross-repo target override (Out of Scope stands).

### Q5: Parent-epic recovery after partial failure
**Context**: FR-005 forbids running `manifest sync` after a failed `tasks_to_issues`, which means a partially-filed parent (e.g., parent epic created on GitHub, but child filing crashed) leaves the manifest with no record of the parent issue number. FR-006 covers the inverse case (filing succeeded, sync failed) by printing the URLs. The "tasks_to_issues failed mid-flight after creating the parent" case is the most likely real-world failure mode and is not explicitly addressed by the spec — the next `/cockpit:file` invocation has no way to know that a parent issue already exists on GitHub, risking a duplicate parent.
**Question**: How does a re-run of `/cockpit:file` detect that a parent epic was already created on GitHub by a previous failed run?
**Options**:
- A: `tasks_to_issues` is responsible — it scans recent issues authored by the current `gh` user with a matching title or a hidden HTML marker before filing, and reuses any match. `/cockpit:file` itself does not need to do anything; this is delegated to the engine.
- B: `/cockpit:file` writes a sidecar file (`specs/<branch>/.cockpit-file-parent`) containing the parent issue number as soon as `tasks_to_issues` emits it, even before child filing completes. On re-run, the wrapper reads this file and passes the existing parent reference to `tasks_to_issues` via a flag, so no new parent is created. The sidecar is cleaned up on a clean success after `manifest sync`.
- C: Out of scope for `/cockpit:file` — if the parent was filed but the run crashed before manifest update, the developer must manually edit the manifest (Q1's chosen format) to record the parent issue number before re-running. The command will trust whatever the manifest says.

**Answer**: A. Engine-side idempotency: `tasks_to_issues` detects an already-created parent by title or hidden HTML marker and reuses it instead of creating a duplicate. This mirrors how the manual filing stayed safe to re-run (title-based dedup) — no sidecar files for `/cockpit:file` to manage.
