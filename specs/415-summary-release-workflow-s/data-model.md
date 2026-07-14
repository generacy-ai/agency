# Data Model: Release Workflow Peer-Dep Consistency Fix

**Feature**: 415-summary-release-workflow-s
**Date**: 2026-07-14

This change is workflow-only; there is no persistent data schema. What follows describes the **transient shapes** the retargeted step operates on within a single workflow run.

## Entities

### PublishedPackage

Emitted by `changesets/action@v1` in `steps.changesets.outputs.publishedPackages` as a JSON-encoded array.

```ts
interface PublishedPackage {
  name: string;    // e.g. "@generacy-ai/agency-plugin-cockpit"
  version: string; // exact semver just published, e.g. "0.1.0"
}

type PublishedPackages = PublishedPackage[];
```

**Validation rules**:
- `name` must start with `@generacy-ai/` for advisory scoping (packages published outside this scope are still validated, but drift advisory is scoped to `@generacy-ai/*`).
- `version` must be valid semver (`semver.valid(version)` truthy). Malformed values abort the check with a descriptive error — signals a changesets output regression, not a peer-dep problem.

**Source**: [`changesets/action` outputs](https://github.com/changesets/action#outputs).

### PublishTag

The npm dist-tag being published in this run. Read from the workflow env (initially the literal `stable`, matching `--tag stable` at `.github/workflows/release.yml:52`).

```ts
type PublishTag = "stable" | "preview" | string; // string for forward-compat
```

**Validation rules**:
- Non-empty.
- Compared exactly to the literal `"stable"` to decide whether to advance `@latest` (FR-004, Q2=A).

### PackageManifest

Result of `npm info <name>@<tag> --json` for a family peer that was *not* published in this run.

```ts
interface PackageManifest {
  name: string;
  version: string;
  peerDependencies?: Record<string, string>; // peer name -> semver range
  // other npm fields ignored
}
```

**Validation rules**:
- `null` when the package is not present on the registry at that tag — the check treats missing peers as non-participating (matches current behaviour at `.github/workflows/release.yml:100`).

### FamilyMap

In-memory map used by the retargeted check to resolve peer ranges.

```ts
interface FamilyEntry {
  name: string;
  version: string;    // version to compare peer ranges against
  source: "published" | "registry"; // published in this run vs. read from npm at PublishTag
  peerDependencies?: Record<string, string>;
}

type FamilyMap = Record<string /* package name */, FamilyEntry>;
```

**Construction rules**:
1. Seed with every entry from `PublishedPackages` at its new version, `source: "published"`. Fetch its `peerDependencies` from the just-published version's manifest (`npm info <name>@<version> --json`).
2. For each peer referenced by any published package that is **not** already in the map, fetch `npm info <peer>@<PublishTag> --json` and add it at `source: "registry"`. Fetch its `peerDependencies` too so transitive references still resolve.
3. Stop after one hop — this is a family peer check, not a full transitive dep-graph walk.

**Relationships**:
- Every peer-dep edge `A -> B` (where `A` is published in this run) is validated against `FamilyMap[B].version`.
- `workspace:*` ranges are converted to concrete semver by changesets before publish; entries whose range is not a valid semver range are skipped (matches existing behaviour at `.github/workflows/release.yml:104`).

### DriftAdvisory

Transient record used only to build `::warning::` annotations. Not persisted.

```ts
interface DriftAdvisory {
  name: string;      // family package name
  latestVersion: string | null;  // npm view <name>@latest version
  stableVersion: string | null;  // npm view <name>@stable version
  reason: "diverged" | "latest-missing" | "stable-missing";
}
```

**Emission rules**:
- Emit one `::warning::` per advisory.
- Emitted only *after* the retargeted check has succeeded and (if the publish channel is stable) after `@latest` advancement has completed, so post-fix state is what's reported.

## Contracts / Interfaces

### Peer-dep validation predicate

```ts
function isConsistent(family: FamilyMap): { ok: boolean; conflicts: Conflict[] };

interface Conflict {
  package: string;         // A
  packageVersion: string;
  peer: string;            // B
  requiredRange: string;   // A's declared peer range on B
  actualVersion: string;   // FamilyMap[B].version
}
```

**Semantics**:
- Iterate every published package `A` in `FamilyMap`, then every entry in `A.peerDependencies` where the peer is present in `FamilyMap` and the range is a valid semver range.
- A **conflict** exists when `!semver.satisfies(actualVersion, requiredRange)`.
- The step fails iff `conflicts.length > 0` (FR-006). Otherwise the step succeeds even if unrelated `@latest` drift exists elsewhere (FR-001).

### `@latest` advancement action

```ts
function advanceLatest(pkg: PublishedPackage): void;
// runs: npm dist-tag add ${pkg.name}@${pkg.version} latest
```

**Semantics**:
- Only invoked when `PublishTag === "stable"` (FR-004, Q2=A).
- Iterates every entry in `PublishedPackages`; each call is independent.
- A single failure fails the step so the run turns red — this represents a real problem (auth, network, registry rejection), not the drift the spec is trying to make advisory.

### Advisory emission

```ts
function emitAdvisory(pkg: PublishedPackage): DriftAdvisory | null;
```

**Semantics**:
- Reads `npm view <name>@latest version` and `npm view <name>@stable version`.
- Returns `null` when the two match.
- Otherwise returns a `DriftAdvisory` whose emission produces exactly one `::warning::` line.

## Relationships summary

```
PublishedPackages (input from changesets)
        │
        ▼
   FamilyMap ──► isConsistent(family) ──► pass/fail (FR-001, FR-002, FR-006)
        │
        ▼ (only if PublishTag == "stable")
   advanceLatest(pkg) for each pkg   ──► @latest dist-tags updated (FR-004)
        │
        ▼
   emitAdvisory(pkg) for each pkg    ──► ::warning:: annotations (FR-003)
```
