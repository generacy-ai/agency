/**
 * humancy.ask_question tool
 *
 * Ask human a freeform question and wait for their response.
 * Supports both direct (IPC) and cloud (HTTP) modes.
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
  type AskQuestionParams,
  type QuestionRequest,
  askQuestionParamsSchema,
  Urgency,
} from '../types/index.js';
import type { QuestionResponse } from '../types/responses.js';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import type { HumancyHttpClient } from '../http/client.js';
import type { CreateDecisionApiRequest } from '../http/types.js';

const CHANNEL_NAME = 'agency.humancy';
const DEFAULT_TIMEOUT = 30000;

/**
 * Create the ask_question tool
 */
export function createAskQuestionTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector,
  httpClient?: HumancyHttpClient
): AgencyTool {
  return {
    name: 'humancy.ask_question',
    description:
      'Ask human a freeform question and wait for their response. Use this when you need clarification or information from the human.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the human',
        },
        context: {
          type: 'string',
          description: 'Additional context to help the human answer',
        },
        urgency: {
          type: 'string',
          enum: ['blocking_now', 'blocking_soon', 'when_available'],
          description:
            'How urgent the question is (default: when_available)',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 30000)',
        },
      },
      required: ['question'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = askQuestionParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const validParams: AskQuestionParams = parseResult.data;
      const timeout = validParams.timeout ?? DEFAULT_TIMEOUT;

      // Check connection mode
      const mode = detector.getMode();
      if (mode === ConnectionMode.OFFLINE) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            'Humancy is offline. Cannot send question. Try again when connected.'
          )
        );
      }

      // Route to appropriate handler based on mode
      if (mode === ConnectionMode.CLOUD && httpClient) {
        return executeCloudMode(validParams, timeout, detector, httpClient);
      }

      // Direct mode - use channel messaging
      return executeDirectMode(validParams, timeout, coreAPI, detector);
    },
  };
}

/**
 * Execute question in cloud mode using HTTP API
 * Questions are converted to decisions with a freeform text response option
 */
async function executeCloudMode(
  validParams: AskQuestionParams,
  timeout: number,
  detector: ConnectionModeDetector,
  httpClient: HumancyHttpClient
): Promise<ToolResult> {
  try {
    // Convert question to decision API format
    // For freeform questions, we create a special decision with text input
    const apiRequest: CreateDecisionApiRequest = {
      question: validParams.question,
      options: [
        { id: 'freeform', label: 'Text Response' },
      ],
      context: validParams.context,
      urgency: validParams.urgency ?? 'when_available',
      timeout,
    };

    // Create decision via API
    const created = await httpClient.createDecision(apiRequest);
    detector.updateConnectionState(true);

    // Poll for decision resolution
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const response = await httpClient.getDecision(created.id);

      if (response.status === 'resolved') {
        // The human's text response is in the note field
        const textResponse = response.human?.note ?? response.selectedOption ?? '';
        return terseToMcpToolResult(TerseOutput.success(textResponse));
      }

      if (response.status === 'expired') {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Question expired after ${timeout}ms. The human may need more time.`,
            { decisionId: created.id }
          )
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout
    return terseToMcpToolResult(
      TerseOutput.failure(
        `Timeout after ${timeout}ms waiting for human response. Consider retrying with a longer timeout.`,
        { decisionId: created.id }
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
 * Execute question in direct mode using channel messaging
 */
async function executeDirectMode(
  validParams: AskQuestionParams,
  timeout: number,
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector
): Promise<ToolResult> {
  // Build request
  const request: QuestionRequest = {
    id: crypto.randomUUID(),
    type: 'question',
    question: validParams.question,
    context: validParams.context,
    urgency: validParams.urgency as Urgency ?? Urgency.WHEN_AVAILABLE,
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

    const response = await waitForResponse<QuestionResponse>(
      coreAPI,
      CHANNEL_NAME,
      request.id,
      timeout
    );

    detector.updateConnectionState(true);

    return terseToMcpToolResult(
      TerseOutput.success(response.response)
    );
  } catch (error) {
    detector.updateConnectionState(false, String(error));

    if (isTimeoutError(error)) {
      const elapsed = (error as { elapsedMs?: number }).elapsedMs ?? timeout;
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Timeout after ${elapsed}ms waiting for human response. ` +
            'Consider retrying with a longer timeout or asking a simpler question.',
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
