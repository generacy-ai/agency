// Reference implementation of auto.md step 4 (unfiltered read) + step 5 (liveness cross-check).
// Contract: specs/394-found-during-cockpit-v1/contracts/unfiltered-stream-consumption.md § C.5.
//
// This module is a specification of the rule in code. The runtime is a model executing prose;
// there is no production code to exercise. The Vitest suite runs assertions against this
// reference to lock in the trim-then-nonempty and compound-liveness semantics.

export interface CounterRef {
  count: number;
}

export interface ReadStreamOptions {
  /** 30-second per-iteration bounded read (documented; synchronous fixture path elides real timers). */
  timeoutMs?: number;
}

/**
 * Consume one bounded-read window's worth of lines.
 *
 * For each raw line: trim leading/trailing whitespace; if the remainder is non-empty,
 * dispatch it (including malformed / truncated JSON — step 4a re-check absorbs it).
 * Whitespace-only lines are dropped as line-framing hygiene.
 *
 * Any line dispatched resets the empty-read counter to 0; a bounded-read window that
 * dispatched nothing increments the counter by 1.
 *
 * Deliberately absent: JSON.parse, line.startsWith('{'), line.includes('"type"'), or any
 * other content predicate beyond trim-then-nonempty. See contract C.5 point 2.
 */
export function readStream(
  source: readonly string[],
  dispatch: (line: string) => void,
  counterRef: CounterRef,
  _options: ReadStreamOptions = {},
): void {
  let dispatched = 0;
  for (const raw of source) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    dispatch(trimmed);
    dispatched += 1;
  }
  if (dispatched > 0) {
    counterRef.count = 0;
  } else {
    counterRef.count += 1;
  }
}

/**
 * D.1–D.9 actionable transition classes. Kept adjacent to the reference impl so a future
 * dispatch-table change is caught by the fixture assertion rather than by drift-in-prose.
 */
const ACTIONABLE_TRANSITION_CLASSES: ReadonlySet<string> = new Set([
  "waiting-for:clarification",
  "waiting-for:spec-review",
  "waiting-for:clarification-review",
  "waiting-for:plan-review",
  "waiting-for:tasks-review",
  "waiting-for:implementation-review",
  "waiting-for:manual-validation",
  "completed:validate",
  "agent:error",
  "phase-complete",
  "waiting-for:address-pr-feedback",
]);

export interface StatusIssue {
  ref?: string;
  transition_class?: string;
  labels?: string[];
}

export interface StatusJson {
  issues?: StatusIssue[];
}

export interface LivenessCrossCheckArgs {
  counter: CounterRef;
  processAlive: () => boolean;
  statusJson: () => StatusJson;
  recovery: (arg: { mode: string }) => void;
}

export const LIVENESS_THRESHOLD = 4;

/**
 * Compound liveness cross-check. Fires only on the conjunction of:
 *   (a) N=4 consecutive empty reads have elapsed,
 *   (b) the background watch process is alive,
 *   (c) `cockpit status --json` reports ≥1 issue in a D.1–D.9 transition class.
 *
 * `statusJson()` is invoked only at the threshold — this mirrors auto.md step 5's rule
 * that the status call runs only when the empty-read count crosses N=4, not per iteration.
 */
export function livenessCrossCheck(args: LivenessCrossCheckArgs): void {
  if (args.counter.count < LIVENESS_THRESHOLD) return;
  if (!args.processAlive()) return;
  const status = args.statusJson();
  const issues = status.issues ?? [];
  const hasActionable = issues.some((issue) => {
    if (issue.transition_class && ACTIONABLE_TRANSITION_CLASSES.has(issue.transition_class)) {
      return true;
    }
    const labels = issue.labels ?? [];
    return labels.some((label) => ACTIONABLE_TRANSITION_CLASSES.has(label));
  });
  if (!hasActionable) return;
  args.recovery({ mode: "startup-sweep" });
}
