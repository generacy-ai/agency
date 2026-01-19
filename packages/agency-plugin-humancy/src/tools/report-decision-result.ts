/**
 * humancy.report_decision_result tool
 *
 * Report the outcome of a decision for attribution tracking.
 */

import {
  type AgencyTool,
  type ToolResult,
  TerseOutput,
  terseToMcpToolResult,
} from '@generacy-ai/agency';
import {
  reportDecisionResultParamsSchema,
  type DecisionOutcome,
} from '../types/index.js';
import type { DecisionStore } from '../storage/index.js';

/**
 * Create the report_decision_result tool
 */
export function createReportDecisionResultTool(
  store: DecisionStore
): AgencyTool {
  return {
    name: 'humancy.report_decision_result',
    description:
      'Report the outcome of a previously made decision. Use this after implementing a decision to track whether it was successful. Supports success, failure, or mixed outcomes.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: {
          type: 'string',
          description: 'The UUID of the decision to report on',
        },
        outcome: {
          type: 'string',
          enum: ['success', 'failure', 'mixed'],
          description: 'The result of implementing the decision',
        },
        details: {
          type: 'string',
          description: 'Optional details about the outcome',
        },
      },
      required: ['decisionId', 'outcome'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = reportDecisionResultParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const { decisionId, outcome, details } = parseResult.data;

      // Check if decision exists
      if (!store.has(decisionId)) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Decision not found: ${decisionId}`
          )
        );
      }

      // Build outcome record
      const outcomeRecord: DecisionOutcome = {
        result: outcome,
        details,
        reportedAt: new Date(),
      };

      // Update the decision record with outcome
      const updated = store.updateOutcome(decisionId, outcomeRecord);
      if (!updated) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Failed to update decision: ${decisionId}`
          )
        );
      }

      // Return success
      return terseToMcpToolResult(
        TerseOutput.success(
          `Outcome reported for ${decisionId}: ${outcome}${details ? ` - ${details}` : ''}`
        )
      );
    },
  };
}
