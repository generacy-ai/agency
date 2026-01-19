/**
 * humancy.get_decision_outcome tool
 *
 * Retrieve a decision record by its ID, including any reported outcome.
 */

import {
  type AgencyTool,
  type ToolResult,
  TerseOutput,
  terseToMcpToolResult,
} from '@generacy-ai/agency';
import { getDecisionOutcomeParamsSchema } from '../types/index.js';
import type { DecisionStore } from '../storage/index.js';

/**
 * Create the get_decision_outcome tool
 */
export function createGetDecisionOutcomeTool(
  store: DecisionStore
): AgencyTool {
  return {
    name: 'humancy.get_decision_outcome',
    description:
      'Retrieve a decision record by its ID. Returns the original request, selected option, three-layer breakdown (if available), and any reported outcome.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: {
          type: 'string',
          description: 'The UUID of the decision to retrieve',
        },
      },
      required: ['decisionId'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = getDecisionOutcomeParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const { decisionId } = parseResult.data;

      // Retrieve decision record
      const record = store.get(decisionId);
      if (!record) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Decision not found: ${decisionId}`
          )
        );
      }

      // Build output data
      const outputData: Record<string, unknown> = {
        decisionId: record.decisionId,
        question: record.request.question,
        selectedOption: record.selectedOption,
        decidedAt: record.decidedAt.toISOString(),
      };

      // Include domain if present
      if (record.request.domain) {
        outputData['domain'] = record.request.domain;
      }

      // Include three-layer breakdown if present
      if (record.threeLayer) {
        outputData['threeLayer'] = record.threeLayer;
      }

      // Include outcome if reported
      if (record.outcome) {
        outputData['outcome'] = {
          result: record.outcome.result,
          details: record.outcome.details,
          reportedAt: record.outcome.reportedAt.toISOString(),
          quality: record.outcome.quality,
        };
      }

      // Format message based on outcome status
      const message = record.outcome
        ? `Decision ${decisionId}: ${record.selectedOption} (outcome: ${record.outcome.result})`
        : `Decision ${decisionId}: ${record.selectedOption} (no outcome reported)`;

      // Include JSON data in the output for machine parsing
      return terseToMcpToolResult(
        TerseOutput.success(`${message}\n${JSON.stringify(outputData)}`)
      );
    },
  };
}
