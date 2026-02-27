#!/usr/bin/env node
/**
 * T009: Validate CI behavior expectations
 *
 * Programmatically verifies that the CI/CD workflow files match
 * the behavioral expectations defined in the implementation plan.
 *
 * Run: node specs/293-1-6-ci-cd/validate-ci-behavior.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function readWorkflow(name) {
  return readFileSync(resolve(repoRoot, `.github/workflows/${name}`), "utf8");
}

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), "utf8"));
}

/**
 * Minimal extraction of a YAML block for a given job ID.
 * Returns the raw text of the job block (from "  <jobId>:" to the next
 * top-level job or end of file).
 */
function extractJobBlock(yaml, jobId) {
  // Match "  jobId:" at 2-space indent (standard GHA job indent)
  const pattern = new RegExp(`^  ${jobId}:`, "m");
  const match = yaml.match(pattern);
  if (!match) return null;

  const start = match.index;
  // Find the next job block at same indent level (2 spaces, no more)
  const rest = yaml.slice(start + match[0].length);
  const nextJob = rest.match(/\n  [a-z][\w-]*:/);
  const end = nextJob ? start + match[0].length + nextJob.index : yaml.length;
  return yaml.slice(start, end);
}

/**
 * Extract the `needs:` value from a job block.
 * Returns an array of dependency job IDs.
 */
function extractNeeds(jobBlock) {
  if (!jobBlock) return [];

  // Match "needs: [a, b, c]" (inline array)
  const inlineMatch = jobBlock.match(/^\s+needs:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    return inlineMatch[1].split(",").map((s) => s.trim());
  }

  // Match "needs:\n      - a\n      - b" (block array)
  const blockMatch = jobBlock.match(/^\s+needs:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.trim().replace(/^-\s*/, ""));
  }

  return [];
}

/**
 * Extract the `if:` condition from a job block (job-level, not step-level).
 */
function extractJobIf(jobBlock) {
  if (!jobBlock) return null;

  // Match the job-level `if:` which appears before `steps:`
  const stepsIndex = jobBlock.indexOf("steps:");
  const scopedBlock = stepsIndex >= 0 ? jobBlock.slice(0, stepsIndex) : jobBlock;

  // Single-line if
  const singleMatch = scopedBlock.match(/^\s+if:\s*(.+)$/m);
  if (singleMatch) return singleMatch[1].trim();

  // Multi-line if (using >- or |)
  const multiMatch = scopedBlock.match(/^\s+if:\s*[>|]-?\s*\n((?:\s+.+\n?)+)/m);
  if (multiMatch) {
    return multiMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  }

  return null;
}

/**
 * Extract a specific step from a job block by its `name:` field.
 */
function extractStep(jobBlock, stepName) {
  if (!jobBlock) return null;

  const pattern = new RegExp(
    `- name:\\s*${stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "m"
  );
  const match = jobBlock.match(pattern);
  if (!match) return null;

  const start = match.index;
  // Find the next step (starts with "      - ")
  const rest = jobBlock.slice(start + match[0].length);
  const nextStep = rest.match(/\n\s{6}- /);
  const end = nextStep
    ? start + match[0].length + nextStep.index
    : jobBlock.length;
  return jobBlock.slice(start, end);
}

/**
 * Extract `if:` condition from a step block.
 */
function extractStepIf(stepBlock) {
  if (!stepBlock) return null;
  const match = stepBlock.match(/^\s+if:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------

const ciYaml = readWorkflow("ci.yml");
const releaseYaml = readWorkflow("release.yml");
const changesetConfig = readJson(".changeset/config.json");
const extensionPkg = readJson("packages/agency-extension/package.json");

// ---------------------------------------------------------------------------
// T009 Core validations
// ---------------------------------------------------------------------------

console.log("\n=== T009: CI Behavior Expectations ===\n");

// --- 1. ci-summary must NOT depend on publish-extension ---
console.log("1. ci-summary job independence from publish-extension:");

const ciSummaryBlock = extractJobBlock(ciYaml, "ci-summary");
assert(ciSummaryBlock !== null, "ci-summary job exists in ci.yml");

const ciSummaryNeeds = extractNeeds(ciSummaryBlock);
assert(
  !ciSummaryNeeds.includes("publish-extension"),
  "ci-summary needs array does not include publish-extension"
);
assert(
  ciSummaryNeeds.includes("lint") &&
    ciSummaryNeeds.includes("typecheck") &&
    ciSummaryNeeds.includes("test") &&
    ciSummaryNeeds.includes("build"),
  "ci-summary depends on [lint, typecheck, test, build]"
);

// --- 2. publish-extension triggers only on develop push ---
console.log("\n2. publish-extension triggers only on develop push:");

const publishExtBlock = extractJobBlock(ciYaml, "publish-extension");
assert(publishExtBlock !== null, "publish-extension job exists in ci.yml");

const publishExtIf = extractJobIf(publishExtBlock);
assert(publishExtIf !== null, "publish-extension has an if condition");
assert(
  publishExtIf.includes("refs/heads/develop"),
  "publish-extension if condition references refs/heads/develop"
);
assert(
  publishExtIf.includes("github.event_name == 'push'"),
  "publish-extension if condition requires push event"
);
assert(
  !publishExtIf.includes("refs/heads/main"),
  "publish-extension if condition does not reference main branch"
);

// --- 3. release.yml extension publish triggers only when changesets publishes ---
console.log("\n3. Release job extension publish triggers on changesets publish:");

const releaseBlock = extractJobBlock(releaseYaml, "release");
assert(releaseBlock !== null, "release job exists in release.yml");

const extPublishStep = extractStep(releaseBlock, "Publish extension to Marketplace");
assert(extPublishStep !== null, "Publish extension to Marketplace step exists");

const extPublishIf = extractStepIf(extPublishStep);
assert(extPublishIf !== null, "Extension publish step has an if condition");
assert(
  extPublishIf.includes("steps.changesets.outputs.published == 'true'"),
  "Extension publish gates on changesets published output"
);
assert(
  extPublishIf.includes("VSCE_PAT"),
  "Extension publish checks for VSCE_PAT"
);

// --- 4. Changesets action has id for output referencing ---
console.log("\n4. Changesets action has proper id:");

const changesetsStep = extractStep(releaseBlock, "Create Release PR or Publish");
assert(changesetsStep !== null, "Create Release PR or Publish step exists");
assert(
  changesetsStep.includes("id: changesets"),
  "Changesets step has id: changesets"
);

// ---------------------------------------------------------------------------
// Supplementary validations (from plan design decisions)
// ---------------------------------------------------------------------------

console.log("\n=== Supplementary Validations ===\n");

// --- 5. publish-extension has PAT guard ---
console.log("5. PAT guard in publish-extension:");

const patStep = extractStep(publishExtBlock, "Check VSCE_PAT");
assert(patStep !== null, "Check VSCE_PAT step exists");
assert(patStep.includes("id: pat"), "PAT check step has id: pat");
assert(
  patStep.includes("has_pat=false") && patStep.includes("has_pat=true"),
  "PAT check outputs has_pat boolean"
);
assert(patStep.includes("::warning::"), "PAT check emits a warning when missing");

// --- 6. Version-exists check ---
console.log("\n6. Version-exists check in publish-extension:");

const versionStep = extractStep(publishExtBlock, "Check if version already published");
assert(versionStep !== null, "Version check step exists");
assert(versionStep.includes("id: version"), "Version check step has id: version");

// --- 7. Publish step gating ---
console.log("\n7. Publish step gating:");

const publishStep = extractStep(publishExtBlock, "Publish extension (pre-release)");
assert(publishStep !== null, "Publish extension (pre-release) step exists");

const publishStepIf = extractStepIf(publishStep);
assert(publishStepIf !== null, "Publish step has an if condition");
assert(
  publishStepIf.includes("steps.pat.outputs.has_pat == 'true'"),
  "Publish step gates on has_pat"
);
assert(
  publishStepIf.includes("steps.version.outputs.exists != 'true'"),
  "Publish step gates on version not existing"
);
assert(publishStep.includes("--pre-release"), "Publish step uses --pre-release flag");

// --- 8. Stable publish does NOT use --pre-release ---
console.log("\n8. Stable publish configuration:");

assert(
  !extPublishStep.includes("--pre-release"),
  "Stable publish step does not use --pre-release flag"
);
assert(
  extPublishStep.includes("--no-dependencies"),
  "Stable publish uses --no-dependencies"
);

// --- 9. VSIX artifact upload ---
console.log("\n9. VSIX artifact upload:");

const packageStep = extractStep(publishExtBlock, "Package VSIX");
assert(packageStep !== null, "Package VSIX step exists");

const uploadStep = extractStep(publishExtBlock, "Upload VSIX artifact");
assert(uploadStep !== null, "Upload VSIX artifact step exists");
assert(
  uploadStep.includes("actions/upload-artifact@v4"),
  "Upload uses actions/upload-artifact@v4"
);
assert(
  uploadStep.includes("if-no-files-found: ignore"),
  "Upload tolerates missing files"
);
assert(
  uploadStep.includes("retention-days: 30"),
  "Upload retains artifacts for 30 days"
);

// --- 10. Changesets config ---
console.log("\n10. Changesets configuration:");

assert(
  !changesetConfig.ignore.includes("@generacy-ai/agency-extension"),
  "Extension is not in changesets ignore list"
);
assert(
  changesetConfig.ignore.includes("claude-plugin-agency-spec-kit"),
  "spec-kit remains in changesets ignore list"
);

// --- 11. Extension package.json ---
console.log("\n11. Extension package.json:");

assert(extensionPkg.private === true, "Extension is marked private");
assert(extensionPkg.preview === true, "Extension has preview: true");

// --- 12. Workflow trigger configuration ---
console.log("\n12. Workflow trigger configuration:");

assert(
  ciYaml.includes("branches: [develop, main]"),
  "ci.yml triggers on develop and main branches"
);

// release.yml triggers only on CI completion for main
assert(
  releaseYaml.includes("workflows: [CI]"),
  "release.yml triggers on CI workflow completion"
);
assert(
  releaseYaml.includes("branches: [main]"),
  "release.yml filters to main branch only"
);

// --- 13. publish-extension needs quality gates ---
console.log("\n13. publish-extension dependencies:");

const publishExtNeeds = extractNeeds(publishExtBlock);
assert(
  publishExtNeeds.includes("lint") &&
    publishExtNeeds.includes("typecheck") &&
    publishExtNeeds.includes("test") &&
    publishExtNeeds.includes("build"),
  "publish-extension depends on [lint, typecheck, test, build]"
);

// --- 14. Phase dependency constraints ---
console.log("\n14. Phase dependency constraints:");

// Phase 1 (changesets) must complete before Phase 2 (ci.yml publish)
// Verified by: extension not in ignore list + private:true are preconditions
// for the publishing workflow to make sense
assert(
  !changesetConfig.ignore.includes("@generacy-ai/agency-extension") &&
    extensionPkg.private === true,
  "Phase 1 (changesets integration) is complete — prerequisite for Phase 2"
);

// Phase 2 and Phase 3 are independent (different workflow files)
assert(
  publishExtBlock !== null && extPublishStep !== null,
  "Phase 2 (ci.yml) and Phase 3 (release.yml) both implemented independently"
);

// Phase 4 depends on Phase 2 (adds to same ci.yml job)
assert(
  packageStep !== null && uploadStep !== null,
  "Phase 4 (VSIX artifact) added to publish-extension job from Phase 2"
);

// --- 15. Non-blocking publish ---
console.log("\n15. Non-blocking publish (ci-summary independence):");

const ciSummaryIfBlock = extractJobIf(ciSummaryBlock);
assert(
  ciSummaryIfBlock && ciSummaryIfBlock.includes("always()"),
  "ci-summary uses if: always() to run regardless"
);

// Verify ci-summary only checks its actual dependencies
assert(
  ciSummaryBlock.includes("needs.lint.result") &&
    ciSummaryBlock.includes("needs.typecheck.result") &&
    ciSummaryBlock.includes("needs.test.result") &&
    ciSummaryBlock.includes("needs.build.result"),
  "ci-summary checks results of lint, typecheck, test, build only"
);
assert(
  !ciSummaryBlock.includes("needs.publish-extension"),
  "ci-summary does not check publish-extension result"
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
