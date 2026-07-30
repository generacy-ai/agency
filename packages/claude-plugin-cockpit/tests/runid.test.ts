import { describe, expect, it } from "vitest";

import {
  GRACEFUL_DEGRADE_WARNING,
  assertRunIdColonFree,
  classifyProbeOutcome,
  deriveRunId,
  serializeGateAckParams,
  serializeGateOpenParams,
  serializeGateStatusQuery,
} from "../lib/runid.js";
import type { GateAckParams, GateOpenParams } from "../lib/gate-wire-types.js";
import type { GateStatusQuery } from "../lib/gate-status-check.js";

describe("469 runId reference module", () => {
  describe("deriveRunId", () => {
    it("469-lib-1 happy path — assembles the full ledger stem verbatim (<tracking-ref-slug>-<timestamp>)", () => {
      // Contract: `contracts/runid-derivation.md § Value shape`. `runId` is the
      // FULL ledger stem verbatim, NOT the trailing timestamp alone.
      expect(
        deriveRunId("generacy-ai-generacy-1053", "20260729-143012"),
      ).toBe("generacy-ai-generacy-1053-20260729-143012");
    });

    it("469-lib-1a assertion aborts pre-flight with a diagnostic naming the offending value if the slug carries a colon", () => {
      // Under today's derivation `<tracking-ref-slug>` is colon-free by
      // construction; the assertion is defence against a future ledger-format
      // change (V1 / FR-013). A slug carrying a colon should trip it here.
      expect(() =>
        deriveRunId("colon:in:slug", "20260729-143012"),
      ).toThrow(/runId invariant violated.*colon:in:slug-20260729-143012/);
    });
  });

  describe("assertRunIdColonFree", () => {
    it("469-lib-2 accepts a colon-free runId", () => {
      expect(() =>
        assertRunIdColonFree("epic-1053-20260729-143012"),
      ).not.toThrow();
    });

    it("469-lib-2a throws on a colon-bearing runId (V1 / FR-013)", () => {
      expect(() => assertRunIdColonFree("epic:1053")).toThrow(
        /runId invariant violated: value contains ':': epic:1053/,
      );
    });
  });

  describe("serialize* helpers", () => {
    const BASE_OPEN: GateOpenParams = {
      gateType: "clarification",
      generation: "gen-A",
      issueRef: "owner/repo#1",
      epicRef: "owner/repo#1",
      issueTitle: "Example",
      issueUrl: "https://github.com/owner/repo/issues/1",
      title: "Approve clarification answers for owner/repo#1",
      body: "...",
      options: [],
      allowFreeText: false,
      sessionId: "session-abc",
      askedAt: "2026-07-29T14:30:12.000Z",
    };
    const BASE_ACK: GateAckParams = {
      gateId: "abc123def4567890abc12345",
      outcome: "applied",
      at: "2026-07-29T14:35:00.000Z",
    };
    const BASE_STATUS: GateStatusQuery = {
      issueRef: "owner/repo#1",
      gateType: "clarification",
      generation: "gen-A",
    };

    it("469-lib-3 serializeGateOpenParams attaches runId under runIdEnabled === true", () => {
      const out = serializeGateOpenParams(
        BASE_OPEN,
        "epic-1053-20260729-143012",
        true,
      );
      expect(out.runId).toBe("epic-1053-20260729-143012");
    });

    it("469-lib-3a serializeGateOpenParams OMITS runId under runIdEnabled === false (V6)", () => {
      const out = serializeGateOpenParams(
        BASE_OPEN,
        "epic-1053-20260729-143012",
        false,
      );
      // OMITTED — not present as null, not present as undefined; the field
      // is absent from the payload's own keys (per V6).
      expect(Object.prototype.hasOwnProperty.call(out, "runId")).toBe(false);
    });

    it("469-lib-3b serializeGateOpenParams OMITS runId when runId is null (defense-in-depth for --gates=local symmetry)", () => {
      const out = serializeGateOpenParams(BASE_OPEN, null, true);
      expect(Object.prototype.hasOwnProperty.call(out, "runId")).toBe(false);
    });

    it("469-lib-4 serializeGateAckParams attaches runId under runIdEnabled === true", () => {
      const out = serializeGateAckParams(
        BASE_ACK,
        "epic-1053-20260729-143012",
        true,
      );
      expect(out.runId).toBe("epic-1053-20260729-143012");
    });

    it("469-lib-4a serializeGateAckParams OMITS runId under runIdEnabled === false (V6)", () => {
      const out = serializeGateAckParams(
        BASE_ACK,
        "epic-1053-20260729-143012",
        false,
      );
      expect(Object.prototype.hasOwnProperty.call(out, "runId")).toBe(false);
    });

    it("469-lib-5 serializeGateStatusQuery attaches runId under runIdEnabled === true", () => {
      const out = serializeGateStatusQuery(
        BASE_STATUS,
        "epic-1053-20260729-143012",
        true,
      );
      expect(out.runId).toBe("epic-1053-20260729-143012");
    });

    it("469-lib-5a serializeGateStatusQuery OMITS runId under runIdEnabled === false (V6)", () => {
      const out = serializeGateStatusQuery(
        BASE_STATUS,
        "epic-1053-20260729-143012",
        false,
      );
      expect(Object.prototype.hasOwnProperty.call(out, "runId")).toBe(false);
    });
  });

  describe("classifyProbeOutcome", () => {
    it("469-lib-6 {status: 'ok'} → runIdEnabled: true", () => {
      const outcome = classifyProbeOutcome(
        { status: "ok", data: { gates: [] } },
        "ui-explicit",
      );
      expect(outcome).toEqual({ kind: "ok", runIdEnabled: true });
    });

    it("469-lib-6a {status: 'error', class: 'invalid-args'} → graceful-degrade with the verbatim warning (regardless of gates mode)", () => {
      // The `invalid-args` graceful-degradation branch is independent of the
      // probe's originating gates mode — a pre-#1067 cluster is a capability
      // gap, not a broken surface.
      for (const mode of [
        "ui-explicit",
        "auto-resolved-ui",
        "form3-tentative-ui",
      ] as const) {
        const outcome = classifyProbeOutcome(
          {
            status: "error",
            class: "invalid-args",
            detail: "unrecognized key runId",
          },
          mode,
        );
        expect(outcome).toEqual({
          kind: "graceful-degrade",
          runIdEnabled: false,
          warning: GRACEFUL_DEGRADE_WARNING,
        });
      }
    });

    it("469-lib-6b query-unreachable + ui-explicit → hard-fail-ui", () => {
      const outcome = classifyProbeOutcome(
        { status: "error", class: "query-unreachable", detail: "outage" },
        "ui-explicit",
      );
      expect(outcome).toEqual({
        kind: "hard-fail-ui",
        reason: "query-unreachable",
        class: "query-unreachable",
        detail: "outage",
      });
    });

    it("469-lib-6c query-unreachable + auto-resolved-ui → downgrade-to-local", () => {
      const outcome = classifyProbeOutcome(
        { status: "error", class: "query-unreachable", detail: "outage" },
        "auto-resolved-ui",
      );
      expect(outcome).toEqual({
        kind: "downgrade-to-local",
        reason: "query-unreachable",
        class: "query-unreachable",
        detail: "outage",
      });
    });

    it("469-lib-6d query-unreachable + form3-tentative-ui → hard-fail-tentative-ui", () => {
      const outcome = classifyProbeOutcome(
        { status: "error", class: "query-unreachable", detail: "outage" },
        "form3-tentative-ui",
      );
      expect(outcome).toEqual({
        kind: "hard-fail-tentative-ui",
        reason: "query-unreachable",
        class: "query-unreachable",
        detail: "outage",
      });
    });

    it("469-lib-6e internal + ui-explicit → hard-fail-ui", () => {
      const outcome = classifyProbeOutcome(
        { status: "error", class: "internal", detail: "cluster 500" },
        "ui-explicit",
      );
      expect(outcome).toEqual({
        kind: "hard-fail-ui",
        reason: "internal",
        class: "internal",
        detail: "cluster 500",
      });
    });

    it("469-lib-6f transport + auto-resolved-ui → downgrade-to-local", () => {
      const outcome = classifyProbeOutcome(
        { status: "error", class: "transport", detail: "MCP exit code 1" },
        "auto-resolved-ui",
      );
      expect(outcome).toEqual({
        kind: "downgrade-to-local",
        reason: "transport",
        class: "transport",
        detail: "MCP exit code 1",
      });
    });

    it("469-lib-6g unknown class token + ui-explicit → hard-fail-ui with reason: unknown-class (never guess a newer class's semantics)", () => {
      const outcome = classifyProbeOutcome(
        {
          status: "error",
          class: "future-mystery-class",
          detail: "new-in-1200",
        },
        "ui-explicit",
      );
      expect(outcome).toEqual({
        kind: "hard-fail-ui",
        reason: "unknown-class",
        class: "future-mystery-class",
        detail: "new-in-1200",
      });
    });
  });
});
