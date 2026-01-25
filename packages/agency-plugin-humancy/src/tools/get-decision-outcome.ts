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
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import { HumancyHttpClient, SSEHandler, type SSEEvent } from '../http/index.js';

/** Default timeout for waiting on SSE events */
const DEFAULT_WAIT_TIMEOUT = 60000;

/**
 * Create the get_decision_outcome tool
 */
export function createGetDecisionOutcomeTool(
  store: DecisionStore,
  detector?: ConnectionModeDetector,
  httpClient?: HumancyHttpClient
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
        wait: {
          type: 'boolean',
          description: 'Wait for decision resolution if still pending (cloud mode only, default: false)',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds if wait=true (default: 60000)',
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
      const wait = (params as { wait?: boolean }).wait ?? false;
      const timeout = (params as { timeout?: number }).timeout ?? DEFAULT_WAIT_TIMEOUT;

      // Check connection mode - use cloud API if available
      const mode = detector?.getMode() ?? ConnectionMode.DIRECT;
      if (mode === ConnectionMode.CLOUD && httpClient) {
        return executeCloudMode(decisionId, wait, timeout, httpClient, detector!);
      }

      // Direct mode: retrieve from local store
      return executeDirectMode(decisionId, store);
    },
  };
}

/**
 * Execute via cloud API with optional SSE subscription
 */
async function executeCloudMode(
  decisionId: string,
  wait: boolean,
  timeout: number,
  httpClient: HumancyHttpClient,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  try {
    // First, try to get current decision status
    const decision = await httpClient.getDecision(decisionId);
    detector.updateConnectionState(true);

    // If decision is already resolved or expired, return immediately
    if (decision.status !== 'pending') {
      return formatDecisionResponse(decisionId, decision);
    }

    // If not waiting, return current pending status
    if (!wait) {
      return terseToMcpToolResult(
        TerseOutput.success(`Decision ${decisionId}: pending (no resolution yet)`)
      );
    }

    // Wait for resolution via SSE
    return waitForDecisionViaSSE(decisionId, timeout, httpClient, detector);
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
 * Wait for decision resolution using SSE subscription
 */
async function waitForDecisionViaSSE(
  decisionId: string,
  timeout: number,
  httpClient: HumancyHttpClient,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  const sseHandler = new SSEHandler({
    connectionTimeoutMs: timeout,
    maxReconnects: 3,
    reconnectBaseDelayMs: 1000,
    authHeaders: httpClient.getAuthHeaders(),
  });

  const eventsUrl = httpClient.getEventsUrl(decisionId);
  const startTime = Date.now();

  try {
    for await (const event of sseHandler.subscribeToDecision(eventsUrl)) {
      if (event.type === 'decision:resolved') {
        detector.updateConnectionState(true);
        return formatSSEDecisionResponse(decisionId, event);
      }

      if (event.type === 'decision:expired') {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Decision ${decisionId}: expired - ${event.reason}`,
            { decisionId, reason: event.reason }
          )
        );
      }

      // heartbeat events are ignored, just continue waiting

      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeout) {
        break;
      }
    }

    // Timeout reached
    return terseToMcpToolResult(
      TerseOutput.failure(
        `Timeout after ${timeout}ms waiting for decision ${decisionId}`,
        { decisionId, elapsed: Date.now() - startTime, timeout }
      )
    );
  } catch (error) {
    detector.updateConnectionState(false, String(error));
    return terseToMcpToolResult(
      TerseOutput.failure(
        error instanceof Error ? error.message : String(error)
      )
    );
  } finally {
    sseHandler.close();
  }
}

/**
 * Format decision response from API
 */
function formatDecisionResponse(
  decisionId: string,
  decision: { status: string; selectedOption?: string; respondedAt?: string; baseline?: unknown; protege?: unknown; human?: unknown }
): ToolResult {
  const outputData: Record<string, unknown> = {
    decisionId,
    status: decision.status,
    selectedOption: decision.selectedOption,
    respondedAt: decision.respondedAt,
  };

  if (decision.baseline) outputData['baseline'] = decision.baseline;
  if (decision.protege) outputData['protege'] = decision.protege;
  if (decision.human) outputData['human'] = decision.human;

  const message = decision.status === 'resolved'
    ? `Decision ${decisionId}: ${decision.selectedOption}`
    : `Decision ${decisionId}: ${decision.status}`;

  return terseToMcpToolResult(
    TerseOutput.success(`${message}\n${JSON.stringify(outputData)}`)
  );
}

/**
 * Format decision response from SSE event
 */
function formatSSEDecisionResponse(
  decisionId: string,
  event: SSEEvent & { type: 'decision:resolved' }
): ToolResult {
  const outputData: Record<string, unknown> = {
    decisionId,
    status: 'resolved',
    selectedOption: event.selectedOption,
    respondedAt: event.respondedAt,
  };

  if (event.baseline) outputData['baseline'] = event.baseline;
  if (event.protege) outputData['protege'] = event.protege;
  if (event.human) outputData['human'] = event.human;

  const message = `Decision ${decisionId}: ${event.selectedOption}`;

  return terseToMcpToolResult(
    TerseOutput.success(`${message}\n${JSON.stringify(outputData)}`)
  );
}

/**
 * Execute via local store (direct mode)
 */
function executeDirectMode(
  decisionId: string,
  store: DecisionStore
): ToolResult {
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
}
