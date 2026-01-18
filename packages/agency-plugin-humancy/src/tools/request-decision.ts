/**
 * humancy.request_decision tool
 *
 * Present structured options to a human and get their selection.
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
  type RequestDecisionParams,
  type DecisionRequest,
  requestDecisionParamsSchema,
  Urgency,
} from '../types/index.js';
import type { DecisionResponse } from '../types/responses.js';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';

const CHANNEL_NAME = 'agency.humancy';
const DEFAULT_TIMEOUT = 60000;

/**
 * Create the request_decision tool
 */
export function createRequestDecisionTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector
): AgencyTool {
  return {
    name: 'humancy.request_decision',
    description:
      'Present structured options to a human and get their selection. Use this when multiple valid approaches exist and you need human guidance.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The decision question',
        },
        options: {
          type: 'array',
          description: 'Available choices (2-10 options)',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the option',
              },
              label: {
                type: 'string',
                description: 'Display text for the option',
              },
              description: {
                type: 'string',
                description: 'Optional explanation of the option',
              },
            },
            required: ['id', 'label'],
          },
        },
        context: {
          type: 'string',
          description: 'Additional context for the decision',
        },
        urgency: {
          type: 'string',
          enum: ['blocking_now', 'blocking_soon', 'when_available'],
          description: 'How urgent the decision is (default: blocking_soon)',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 60000)',
        },
      },
      required: ['question', 'options'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = requestDecisionParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const validParams: RequestDecisionParams = parseResult.data;
      const timeout = validParams.timeout ?? DEFAULT_TIMEOUT;

      // Check connection mode
      const mode = detector.getMode();
      if (mode === ConnectionMode.OFFLINE) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            'Humancy is offline. Cannot request decision. Try again when connected.'
          )
        );
      }

      // Build request
      const request: DecisionRequest = {
        id: crypto.randomUUID(),
        type: 'decision',
        question: validParams.question,
        options: validParams.options,
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

        const response = await waitForResponse<DecisionResponse>(
          coreAPI,
          CHANNEL_NAME,
          request.id,
          timeout
        );

        detector.updateConnectionState(true);

        // Validate that selected option exists
        const selectedOption = validParams.options.find(
          (opt) => opt.id === response.selectedOption
        );

        if (!selectedOption) {
          return terseToMcpToolResult(
            TerseOutput.failure(
              `Invalid selection: ${response.selectedOption} is not a valid option ID`
            )
          );
        }

        return terseToMcpToolResult(
          TerseOutput.success(`Selected: ${response.selectedOption}`)
        );
      } catch (error) {
        detector.updateConnectionState(false, String(error));

        if (isTimeoutError(error)) {
          const elapsed = (error as { elapsedMs?: number }).elapsedMs ?? timeout;
          return terseToMcpToolResult(
            TerseOutput.failure(
              `Timeout after ${elapsed}ms waiting for decision. ` +
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
