# Contract: Invocation parser extraction rules (Q2=B)

Structural contract for the parser that scans `commands/*.md` and `tests/fixtures/*-drift-*.md` files for `generacy cockpit <verb>` invocations. This parser is the input side of the drift audit (assertion 398-1) and the regression check (assertion 398-2).

## Inputs

- A file path (`string`) to a markdown file.
- The distinct set of cockpit verbs (`string[]`, e.g., `["merge", "advance", "queue", ...]`) — this is the closed vocabulary the parser matches against. Verbs are enumerated from the snapshot-file set (`ls tests/fixtures/help-snapshots/*.txt`); the parser does not attempt to match arbitrary tokens after `generacy cockpit`.

## Output

An array of `Invocation` records:

```typescript
interface Invocation {
  file: string;           // absolute or repo-relative path
  line: number;           // 1-based line number of the invocation's start
  verb: string;           // e.g., "merge"
  argTokens: string[];    // positional argument tokens in order, e.g., ["<issue>"]
  source: "fenced" | "inline";
}
```

## Extraction rules (Q2=B)

The parser applies **two extraction modes** and unions their results. Each mode's output is an `Invocation[]`; the combined output is the concatenation with source-preserved.

### Mode (a): Fenced code blocks

A **fenced code block** is a run of lines between opening and closing triple-backtick fences (```` ``` ````), optionally with an info string on the opening fence (` ```bash `, ` ```sh `, etc.). Indented 4-space code blocks are also considered fenced.

For each line inside a fenced block:
1. Trim leading/trailing whitespace.
2. If the line starts with `generacy cockpit <verb>` (where `<verb>` is in the known-verbs set): emit an `Invocation` with `source: "fenced"`, `argTokens = tokenize(line.slice("generacy cockpit <verb>".length))`.
3. Otherwise: skip.

**Tokenization**: split the remainder on whitespace; drop leading/trailing empty tokens; the resulting list is `argTokens`.

**Filtering to positional args**: `argTokens` includes ONLY positional arg-kind tokens (angle-bracketed `<...>` placeholders OR concrete literals not starting with `-`). Tokens starting with `-` (flags like `--yes`, `--max-fix-attempts=1`, `-h`) are dropped. Trailing punctuation like `;` or `.` at the end of the last token is stripped.

### Mode (b): Inline backtick spans

An **inline backtick span** is a run of characters between single-backtick pairs (`` `...` ``) or double-backtick pairs (`` ``...`` ``) on a single line (not inside a fenced code block).

For each inline span:
1. Take the span's content (the characters between the backticks).
2. Trim leading/trailing whitespace.
3. If the content starts with `generacy cockpit <verb>` (verb in known-verbs set) AND has at least one non-whitespace token after `<verb>`: emit an `Invocation` with `source: "inline"`, `argTokens = tokenize(content.slice("generacy cockpit <verb>".length))`.
4. Otherwise: skip.

**Has-an-argument rule**: the "at least one non-whitespace token after `<verb>`" check is load-bearing. It excludes bare-verb spans (`` `generacy cockpit merge` `` in prose like "MUST NOT call `generacy cockpit merge`") without needing any author annotations. A bare-verb span is a *reference*, not an *invocation*.

**Tokenization + filtering**: same as Mode (a).

## Bare-verb-mention exclusion (design load-bearing check)

The following prose lines from real playbooks MUST NOT produce an `Invocation`:

```markdown
It MUST NOT call `generacy cockpit merge` — the parent owns the loop.
The subagent MUST NOT invoke any slash command, including `generacy cockpit advance`.
```

Both examples contain bare-verb spans (no argument after the verb). Under the has-an-argument rule, both are skipped. This is the load-bearing property that makes Q2=B safe to apply broadly without an annotation surface (Q2=C's failure mode).

The following prose lines MUST produce an `Invocation`:

```markdown
Run `generacy cockpit merge <issue>` after confirming green checks.
The dispatch step invokes `generacy cockpit advance --gate merge-conflicts <issue-ref>`.
```

Both examples have arguments after the verb (`<issue>`, `--gate merge-conflicts <issue-ref>`). The has-an-argument rule fires; both produce `Invocation` records.

## Order and de-duplication

- Invocations are emitted in file-order (line number ascending).
- The same line producing multiple invocations (e.g., two inline spans on the same line) emits multiple `Invocation` records with the same `line` number.
- No de-duplication: if the same invocation appears twice in the same file, both are audited. (Deduplication would mask copy-paste bugs.)

## Interaction with markdown parsing edge cases

- **Nested code fences**: not handled (rare in playbooks; if a fence appears inside another fence, the outer fence's rules apply). Documented as a known limitation.
- **Backticks inside a fenced code block**: the fenced block's rules apply; inline-backtick-span extraction is suppressed inside fenced blocks (to avoid double-counting).
- **Escaped backticks** (`` \` ``): treated as literal characters; the parser doesn't invoke the escape.
- **Backticks in prose adjacent to punctuation** (e.g., `..., \`generacy cockpit merge <issue>\`.`): the parser strips trailing punctuation from the last token (see Tokenization rules); a trailing `.` at the end of the span's last token becomes part of the token if unstrippable, causing an audit mismatch. Documented as a rare edge case — fix in the playbook by not putting a period inside the backtick span.

## Reference implementation (pseudo-TypeScript)

```typescript
function parseInvocations(filePath: string, knownVerbs: readonly string[]): Invocation[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const invocations: Invocation[] = [];

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    // Fence detection
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      // Mode (a): fenced content
      const trimmed = line.trim();
      const match = matchVerbAtStart(trimmed, knownVerbs);
      if (match) {
        invocations.push({
          file: filePath,
          line: lineNo,
          verb: match.verb,
          argTokens: extractPositionalTokens(match.rest),
          source: "fenced",
        });
      }
      continue;
    }

    // Mode (b): inline backtick spans on this line
    const spans = extractInlineSpans(line);
    for (const span of spans) {
      const content = span.content.trim();
      const match = matchVerbAtStart(content, knownVerbs);
      if (!match) continue;
      const rest = match.rest.trim();
      if (rest.length === 0) continue;  // has-an-argument rule
      invocations.push({
        file: filePath,
        line: lineNo,
        verb: match.verb,
        argTokens: extractPositionalTokens(rest),
        source: "inline",
      });
    }
  }

  return invocations;
}

function matchVerbAtStart(text: string, knownVerbs: readonly string[]): { verb: string; rest: string } | null {
  const prefix = "generacy cockpit ";
  if (!text.startsWith(prefix)) return null;
  const afterPrefix = text.slice(prefix.length);
  for (const verb of knownVerbs) {
    if (afterPrefix === verb || afterPrefix.startsWith(verb + " ") || afterPrefix.startsWith(verb + "\t")) {
      return { verb, rest: afterPrefix.slice(verb.length) };
    }
  }
  return null;
}

function extractPositionalTokens(rest: string): string[] {
  const tokens = rest.trim().split(/\s+/).filter(t => t.length > 0);
  const positional: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) continue;  // flag
    // Strip trailing punctuation (., ;, )) that leaked in from prose:
    const stripped = token.replace(/[.,;:)]+$/, "");
    if (stripped.length > 0) positional.push(stripped);
  }
  return positional;
}

function extractInlineSpans(line: string): { content: string; startCol: number }[] {
  // Naive single-backtick span extractor. Enhance for double-backtick if needed.
  const spans: { content: string; startCol: number }[] = [];
  const regex = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(line)) !== null) {
    spans.push({ content: m[1]!, startCol: m.index + 1 });
  }
  return spans;
}
```

## Verifier

The parser itself doesn't have a standalone test — its behavior is verified through the two audit assertions:

- **398-1**: sweeps `commands/*.md`. Any bug in the parser (missing invocations, spurious invocations) surfaces as either a false-negative (drift not caught, discovered on the next smoke session) or a false-positive (audit fails on non-invocations). Day-one, the audit is expected green; a false-positive fails the CI run.
- **398-2**: sweeps `tests/fixtures/398-drift-auto.md`. The regression fixture contains both an actual invocation (D.5 step 2, `<pr-ref>`) and prose that could naively be mistaken for invocations (bare-verb spans in prose). The audit's expected output is exactly one mismatch (the D.5 invocation); the fixture's design confirms the parser doesn't fire on bare-verb prose (Q2=B safety property).

## Design non-goals

- **Not a general-purpose markdown parser.** The parser only handles the specific extraction rules for `generacy cockpit <verb>` invocations. It doesn't build an AST, doesn't render markdown, doesn't handle every markdown corner case. If a playbook edit uses a markdown feature the parser doesn't handle (e.g., a nested fence, an HTML block, a code span with escape sequences), the parser may miss or misclassify — that's a known limitation, and the fix is to keep playbook prose in the plain fence/inline styles the parser handles.
- **Not a linter.** The parser doesn't complain about "should this be an invocation?" — it either matches the rules or doesn't. If a bare-verb mention should have been an invocation (missing argument in the playbook prose), the audit doesn't catch that; a code-review reviewer does.

## Failure modes

**Parser emits an `Invocation` for something that isn't an invocation** (false positive): the audit fails on a legitimate playbook edit. Fix: refine the extraction rules (e.g., the parser is treating a comment as an invocation). This is caught by 398-1 running on the day-one clean state.

**Parser skips a real invocation** (false negative): the audit doesn't fail even though drift exists. Discovered by a smoke session hitting the drift. Fix: extend the parser to cover the missed shape (e.g., double-backtick inline spans if the missed invocation was wrapped in double backticks). This is caught by 398-2 if the drift shape matches the regression fixture.

**Parser treats a bare-verb mention as an invocation** (Q2=B safety violation): the audit fails on prose the author intended as a reference. Discovered on the day-one run. Fix: verify the has-an-argument rule is applied; if the rule is applied but a bare-verb span has stray whitespace-only tokens, refine the token filter.
