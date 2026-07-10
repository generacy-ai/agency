/**
 * gate-vocabulary.ts
 *
 * Plugin-local declared vocabulary of `waiting-for:*` labels the auto.md
 * playbook must dispatch. The drift audit (see tests/playbook-verification.test.ts,
 * assertion 396-3) asserts every token in this list appears as a Trigger in
 * auto.md's § Dispatch table.
 *
 * Upstream sources (sync obligation — this file must be re-synced when
 * upstream changes, otherwise the audit fails at build time; runtime safety
 * is preserved by auto.md D.10's tightened trigger regardless of sync state):
 *
 * - /workspaces/tetrad-development/.github/labels.yml
 *   (canonical machine-readable list consumed by scripts/sync-labels.sh; 11
 *   `waiting-for:*` tokens as of #396)
 * - /workspaces/tetrad-development/docs/label-protocol.md
 *   (human-facing reference; author-curated; may lag labels.yml)
 *
 * The 12th token (`waiting-for:merge-conflicts`) is registered in the two
 * upstream sources by the operator as a same-day docs/config edit companion
 * to #396 (see specs/396-found-during-cockpit-v1/plan.md § Companion
 * operator-side edits).
 */

export const GATE_VOCABULARY = [
  "waiting-for:clarification",
  "waiting-for:spec-review",
  "waiting-for:clarification-review",
  "waiting-for:plan-review",
  "waiting-for:tasks-review",
  "waiting-for:implementation-review",
  "waiting-for:manual-validation",
  "waiting-for:address-pr-feedback",
  "waiting-for:pr-feedback",
  "waiting-for:children-complete",
  "waiting-for:dependencies",
  "waiting-for:merge-conflicts",
] as const;

export type GateVocabularyToken = (typeof GATE_VOCABULARY)[number];
