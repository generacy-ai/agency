/**
 * humancy.request_review tool
 *
 * Request human review of an artifact (code, document, plan, etc.).
 */

import {
  type AgencyTool,
  type ToolResult,
  TerseOutput,
  terseToMcpToolResult,
  createMessageEnvelope,
  type AgencyCoreAPI,
  type MessageEnvelope,
} from '@generacy-ai/agency';
import {
  type RequestReviewParams,
  type ReviewRequest,
  requestReviewParamsSchema,
  Urgency,
} from '../types/index.js';
import { type ReviewResponse, ReviewStatus } from '../types/responses.js';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import { HumancyHttpClient, type CreateDecisionApiRequest } from '../http/index.js';

const CHANNEL_NAME = 'agency.humancy';
const DEFAULT_TIMEOUT = 60000; // Reviews typically need more time

/**
 * Create the request_review tool
 */
export function createRequestReviewTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector,
  httpClient?: HumancyHttpClient
): AgencyTool {
  return {
    name: 'humancy.request_review',
    description:
      'Request human review of an artifact (code, document, plan, etc.). Returns approval status with optional comments.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        artifact: {
          type: 'string',
          description: 'Path to file or content to review',
        },
        context: {
          type: 'string',
          description: 'What the human should focus on',
        },
        urgency: {
          type: 'string',
          enum: ['blocking_now', 'blocking_soon', 'when_available'],
          description: 'How urgent the review is (default: blocking_soon)',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 60000)',
        },
      },
      required: ['artifact'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = requestReviewParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const validParams: RequestReviewParams = parseResult.data;
      const timeout = validParams.timeout ?? DEFAULT_TIMEOUT;

      // Check connection mode
      const mode = detector.getMode();
      if (mode === ConnectionMode.OFFLINE) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            'Humancy is offline. Cannot request review. Try again when connected.'
          )
        );
      }

      // Route based on connection mode
      if (mode === ConnectionMode.CLOUD && httpClient) {
        return executeCloudMode(validParams, timeout, httpClient, detector);
      }

      return executeDirectMode(validParams, timeout, coreAPI, detector);
    },
  };
}

/**
 * Execute review request via cloud API
 */
async function executeCloudMode(
  params: RequestReviewParams,
  timeout: number,
  httpClient: HumancyHttpClient,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  // Convert review request to decision API format
  const apiRequest: CreateDecisionApiRequest = {
    question: `Review request: ${params.artifact}${params.context ? `\n\nContext: ${params.context}` : ''}`,
    options: [
      { id: 'approve', label: 'Approve', description: 'Approve the artifact as is' },
      { id: 'reject', label: 'Reject', description: 'Reject the artifact' },
      { id: 'changes_requested', label: 'Request Changes', description: 'Request changes before approval' },
    ],
    context: params.context,
    urgency: params.urgency ?? 'blocking_soon',
    timeout,
  };

  try {
    // Create decision
    const created = await httpClient.createDecision(apiRequest);

    // Poll for resolution
    const resolved = await pollForDecision(httpClient, created.id, timeout);

    detector.updateConnectionState(true);

    if (resolved.status === 'pending') {
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Timeout waiting for review response. Decision ID: ${created.id}`,
          { decisionId: created.id, elapsed: timeout, timeout }
        )
      );
    }

    if (resolved.status === 'expired') {
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Review request expired. Decision ID: ${created.id}`,
          { decisionId: created.id }
        )
      );
    }

    // Map decision response to review result
    const selectedOption = resolved.selectedOption;
    if (selectedOption === 'approve') {
      return terseToMcpToolResult(TerseOutput.success('approved'));
    }

    // Rejection or changes requested
    const note = resolved.human?.note ?? 'No additional comments';
    const status = selectedOption === 'reject' ? 'rejected' : 'changes_requested';
    return terseToMcpToolResult(
      TerseOutput.failure(`${status}: ${note}`)
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
 * Execute review request via direct IPC (existing behavior)
 */
async function executeDirectMode(
  params: RequestReviewParams,
  timeout: number,
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  // Build request
  const request: ReviewRequest = {
    id: crypto.randomUUID(),
    type: 'review',
    artifact: params.artifact,
    context: params.context,
    urgency: params.urgency as Urgency ?? Urgency.BLOCKING_SOON,
    timeout,
    timestamp: new Date(),
  };

  // Create message envelope
  const envelope = createMessageEnvelope({
    channel: CHANNEL_NAME,
    sender: coreAPI.getPluginId(),
    payload: request,
  });

  try {
    coreAPI.sendMessage(CHANNEL_NAME, envelope);

    const response = await waitForResponse<ReviewResponse>(
      coreAPI,
      CHANNEL_NAME,
      request.id,
      timeout
    );

    detector.updateConnectionState(true);

    // Format response based on status
    if (response.status === ReviewStatus.APPROVED) {
      return terseToMcpToolResult(TerseOutput.success('approved'));
    }

    // Rejection or changes requested includes comments
    const comments = response.comments ?? 'No additional comments';
    return terseToMcpToolResult(
      TerseOutput.failure(`${response.status}: ${comments}`)
    );
  } catch (error) {
    detector.updateConnectionState(false, String(error));

    if (isTimeoutError(error)) {
      const elapsed = (error as { elapsedMs?: number }).elapsedMs ?? timeout;
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Timeout after ${elapsed}ms waiting for review response. ` +
            'The human may need more time. Consider retrying with a longer timeout.',
          { requestId: request.id, elapsed, timeout }
        )
      );
    }

    return terseToMcpToolResult(
      TerseOutput.failure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

/**
 * Poll for decision resolution
 */
async function pollForDecision(
  httpClient: HumancyHttpClient,
  decisionId: string,
  timeout: number
): Promise<{ status: string; selectedOption?: string; human?: { note?: string } }> {
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const decision = await httpClient.getDecision(decisionId);
    if (decision.status !== 'pending') {
      return decision;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { status: 'pending' };
}

/**
 * Wait for a response with matching request ID
 */
async function waitForResponse<T>(
  coreAPI: AgencyCoreAPI,
  channel: string,
  requestId: string,
  timeout: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject({
        type: 'timeout',
        requestId,
        elapsedMs: timeout,
        configuredTimeoutMs: timeout,
        suggestion: 'Try again with a longer timeout',
      });
    }, timeout);

    const unsubscribe = coreAPI.onMessage<T>(channel, (msg: MessageEnvelope<T>) => {
      const payload = msg.payload as { requestId?: string };
      if (payload.requestId === requestId) {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(msg.payload);
      }
    });
  });
}

/**
 * Check if error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'timeout'
  );
}
