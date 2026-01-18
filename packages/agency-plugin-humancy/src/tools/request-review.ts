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

const CHANNEL_NAME = 'agency.humancy';
const DEFAULT_TIMEOUT = 60000; // Reviews typically need more time

/**
 * Create the request_review tool
 */
export function createRequestReviewTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector
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

      // Build request
      const request: ReviewRequest = {
        id: crypto.randomUUID(),
        type: 'review',
        artifact: validParams.artifact,
        context: validParams.context,
        urgency: validParams.urgency as Urgency ?? Urgency.BLOCKING_SOON,
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
    },
  };
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
