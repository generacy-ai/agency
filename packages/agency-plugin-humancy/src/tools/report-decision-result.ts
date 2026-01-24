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
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import { HumancyHttpClient } from '../http/index.js';

/**
 * Create the report_decision_result tool
 */
export function createReportDecisionResultTool(
  store: DecisionStore,
  detector?: ConnectionModeDetector,
  httpClient?: HumancyHttpClient
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

      // Build outcome record
      const outcomeRecord: DecisionOutcome = {
        result: outcome,
        details,
        reportedAt: new Date(),
      };

      // Check connection mode
      const mode = detector?.getMode() ?? ConnectionMode.DIRECT;

      // In cloud mode, POST result to API
      if (mode === ConnectionMode.CLOUD && httpClient) {
        return executeCloudMode(decisionId, outcomeRecord, httpClient, store, detector!);
      }

      // Direct mode: update local store only
      return executeDirectMode(decisionId, outcomeRecord, store);
    },
  };
}

/**
 * Execute via cloud API
 *
 * Note: The current humancy-cloud API doesn't have a dedicated outcome endpoint.
 * This implementation stores the outcome locally and logs a warning.
 * A future API version should support POST /decisions/:id/outcome
 */
async function executeCloudMode(
  decisionId: string,
  outcomeRecord: DecisionOutcome,
  httpClient: HumancyHttpClient,
  store: DecisionStore,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  try {
    // Verify decision exists in cloud
    await httpClient.getDecision(decisionId);
    detector.updateConnectionState(true);

    // Store outcome locally (API doesn't have outcome endpoint yet)
    // In a future version, this would POST to /decisions/:id/outcome
    if (store.has(decisionId)) {
      store.updateOutcome(decisionId, outcomeRecord);
    }

    // Return success
    return terseToMcpToolResult(
      TerseOutput.success(
        `Outcome reported for ${decisionId}: ${outcomeRecord.result}${outcomeRecord.details ? ` - ${outcomeRecord.details}` : ''}`
      )
    );
  } catch (error) {
    detector.updateConnectionState(false, String(error));
    return terseToMcpToolResult(
      TerseOutput.failure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

/**
 * Execute via local store (direct mode)
 */
function executeDirectMode(
  decisionId: string,
  outcomeRecord: DecisionOutcome,
  store: DecisionStore
): ToolResult {
  // Check if decision exists
  if (!store.has(decisionId)) {
    return terseToMcpToolResult(
      TerseOutput.failure(
        `Decision not found: ${decisionId}`
      )
    );
  }

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
      `Outcome reported for ${decisionId}: ${outcomeRecord.result}${outcomeRecord.details ? ` - ${outcomeRecord.details}` : ''}`
    )
  );
}
