Filing new issue for generacy-ai/agency#100:

**Title:** Flaky test in packages/foo tests/bar.test.ts
**Labels:** (none)
**Body:**

The `bar.test.ts` suite intermittently fails on CI with a race between two callbacks whose ordering is not guaranteed by the current spec. Repro requires seeded jitter — see the linked run log.

**Filing target:** generacy-ai/agency (from tracking ref)
**Parent tracking ref:** generacy-ai/agency#100
