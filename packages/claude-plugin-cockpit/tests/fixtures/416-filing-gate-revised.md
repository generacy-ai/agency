Filing new issue for generacy-ai/agency#100:

**Title:** Flaky test in packages/foo/tests/bar.test.ts — ordering race between callbacks
**Labels:** bug, flaky-test
**Body:**

The `bar.test.ts` suite intermittently fails on CI with a race between two callbacks whose ordering is not guaranteed by the current spec.

Steps to reproduce:
1. Run the suite with `--seed=17` under CI's jitter budget.
2. Observe the assertion in `bar.test.ts:42` fail roughly 1 in 5 runs.

The underlying failure is a design decision on ordering guarantees, not a fixup — see the linked run log for the trace.

**Filing target:** generacy-ai/agency (from tracking ref)
**Parent tracking ref:** generacy-ai/agency#100
