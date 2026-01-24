/**
 * humancy.request_decision tool
 *
 * Present structured options to a human and get their selection.
 * Enhanced with three-layer decision model support.
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
  type RequestDecisionParams,
  type DecisionRequest,
  type DecisionRecord,
  requestDecisionParamsSchema,
  Urgency,
} from '../types/index.js';
import type { DecisionResponse } from '../types/responses.js';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import type { DecisionStore } from '../storage/index.js';
import type { HumancyHttpClient } from '../http/client.js';
import type { CreateDecisionApiRequest, DecisionApiResponse } from '../http/types.js';

const CHANNEL_NAME = 'agency.humancy';
const DEFAULT_TIMEOUT = 60000;

/**
 * Create the request_decision tool
 */
export function createRequestDecisionTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector,
  store?: DecisionStore,
  httpClient?: HumancyHttpClient
): AgencyTool {
  return {
    name: 'humancy.request_decision',
    description:
      'Present structured options to a human and get their selection. Use this when multiple valid approaches exist and you need human guidance. Supports three-layer decision model with baseline/protege recommendations.',
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
              tradeoffs: {
                type: 'object',
                description: 'Optional tradeoff analysis',
                properties: {
                  pros: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Advantages of this option',
                  },
                  cons: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Disadvantages of this option',
                  },
                },
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
        // Enhanced three-layer fields
        domain: {
          type: 'array',
          items: { type: 'string' },
          description: 'Domain tags for principle matching (e.g., ["architecture", "backend"])',
        },
        decisionContext: {
          type: 'object',
          description: 'Structured context for decision',
          properties: {
            projectConstraints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Project-level constraints that may apply',
            },
            relatedIssue: {
              type: 'string',
              description: 'Related issue reference',
            },
          },
        },
        includeRecommendations: {
          type: 'boolean',
          description: 'Whether to include baseline/protege recommendations in response',
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

      // Route to appropriate handler based on mode
      if (mode === ConnectionMode.CLOUD && httpClient) {
        return executeCloudMode(validParams, timeout, detector, store, httpClient);
      }

      // Direct mode - use channel messaging
      return executeDirectMode(validParams, timeout, coreAPI, detector, store);
    },
  };
}

/**
 * Execute decision request in cloud mode using HTTP API
 */
async function executeCloudMode(
  validParams: RequestDecisionParams,
  timeout: number,
  detector: ConnectionModeDetector,
  store: DecisionStore | undefined,
  httpClient: HumancyHttpClient
): Promise<ToolResult> {
  try {
    // Build API request
    const apiRequest: CreateDecisionApiRequest = {
      question: validParams.question,
      options: validParams.options.map((opt) => ({
        id: opt.id,
        label: opt.label,
        description: opt.description,
        tradeoffs: opt.tradeoffs,
      })),
      context: validParams.context,
      urgency: validParams.urgency ?? 'blocking_soon',
      domain: validParams.domain,
      timeout,
    };

    // Create decision via API
    const created = await httpClient.createDecision(apiRequest);
    detector.updateConnectionState(true);

    // Poll for decision resolution (or could use SSE in future)
    const response = await pollForDecision(httpClient, created.id, timeout);

    if (response.status === 'expired') {
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Decision expired after ${timeout}ms. The human may need more time.`,
          { decisionId: created.id }
        )
      );
    }

    if (response.status !== 'resolved' || !response.selectedOption) {
      return terseToMcpToolResult(
        TerseOutput.failure(
          `Decision not resolved: ${response.status}`,
          { decisionId: created.id }
        )
      );
    }

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

    // Store decision record if store is available
    if (store) {
      // Map API response to internal three-layer format
      // API returns simpler types, internal format is more structured
      const threeLayer =
        response.baseline && response.protege && response.human
          ? {
              baseline: {
                optionId: response.baseline.optionId,
                confidence: response.baseline.confidence,
                reasoning: [], // API doesn't provide reasoning array
              },
              protege: {
                optionId: response.protege.optionId,
                confidence: 0, // API doesn't provide confidence
                reasoning: response.protege.reasoning ? [response.protege.reasoning] : [],
                appliedPrinciples: [], // API doesn't provide principles
              },
              human: {
                optionId: response.human.optionId,
                matchedProtege: response.human.optionId === response.protege.optionId,
                coaching: response.human.note ?? null,
              },
            }
          : undefined;

      const record: DecisionRecord = {
        decisionId: response.id,
        request: {
          question: validParams.question,
          options: validParams.options,
          domain: validParams.domain,
          context: validParams.decisionContext,
          timestamp: new Date(),
        },
        threeLayer,
        selectedOption: response.selectedOption,
        decidedAt: response.respondedAt ? new Date(response.respondedAt) : new Date(),
      };
      store.store(record);
    }

    // Build enhanced response output
    const outputData: Record<string, unknown> = {
      selectedOption: response.selectedOption,
      decisionId: response.id,
    };

    // Include three-layer breakdown if requested and present
    if (validParams.includeRecommendations) {
      if (response.baseline) {
        outputData['baseline'] = response.baseline;
      }
      if (response.protege) {
        outputData['protege'] = response.protege;
      }
      if (response.human) {
        outputData['human'] = response.human;
      }
    }

    // Format message
    const message = `Selected: ${response.selectedOption} (decisionId: ${response.id})`;

    // For terse output, include JSON data for machine parsing when three-layer data exists
    const hasThreeLayerData = validParams.includeRecommendations;
    const outputMessage = hasThreeLayerData
      ? `${message}\n${JSON.stringify(outputData)}`
      : message;

    return terseToMcpToolResult(TerseOutput.success(outputMessage));
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
 * Poll for decision resolution
 */
async function pollForDecision(
  httpClient: HumancyHttpClient,
  decisionId: string,
  timeout: number
): Promise<DecisionApiResponse> {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds

  while (Date.now() - startTime < timeout) {
    const response = await httpClient.getDecision(decisionId);

    if (response.status !== 'pending') {
      return response;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Return last known state (likely still pending = expired)
  return httpClient.getDecision(decisionId);
}

/**
 * Execute decision request in direct mode using channel messaging
 */
async function executeDirectMode(
  validParams: RequestDecisionParams,
  timeout: number,
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector,
  store: DecisionStore | undefined
): Promise<ToolResult> {
  // Build request (enhanced with three-layer fields)
  const request: DecisionRequest = {
    id: crypto.randomUUID(),
    type: 'decision',
    question: validParams.question,
    options: validParams.options,
    context: validParams.context,
    urgency: (validParams.urgency as Urgency) ?? Urgency.BLOCKING_SOON,
    timeout,
    timestamp: new Date(),
    // Include enhanced fields if provided
    domain: validParams.domain,
    decisionContext: validParams.decisionContext,
    includeRecommendations: validParams.includeRecommendations,
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

    // Store decision record if store is available and we have a decisionId
    if (store && response.decisionId) {
      const record: DecisionRecord = {
        decisionId: response.decisionId,
        request: {
          question: validParams.question,
          options: validParams.options,
          domain: validParams.domain,
          context: validParams.decisionContext,
          timestamp: request.timestamp,
        },
        threeLayer:
          response.baseline && response.protege && response.human
            ? {
                baseline: response.baseline,
                protege: response.protege,
                human: response.human,
              }
            : undefined,
        selectedOption: response.selectedOption,
        decidedAt: response.respondedAt,
      };
      store.store(record);
    }

    // Build enhanced response output
    const outputData: Record<string, unknown> = {
      selectedOption: response.selectedOption,
    };

    // Include decisionId if present (for outcome reporting)
    if (response.decisionId) {
      outputData['decisionId'] = response.decisionId;
    }

    // Include three-layer breakdown if requested and present
    if (validParams.includeRecommendations) {
      if (response.baseline) {
        outputData['baseline'] = response.baseline;
      }
      if (response.protege) {
        outputData['protege'] = response.protege;
      }
      if (response.human) {
        outputData['human'] = response.human;
      }
    }

    // Format message: basic for simple, extended for three-layer
    const message = response.decisionId
      ? `Selected: ${response.selectedOption} (decisionId: ${response.decisionId})`
      : `Selected: ${response.selectedOption}`;

    // For terse output, include JSON data for machine parsing when three-layer data exists
    const hasThreeLayerData =
      response.decisionId && validParams.includeRecommendations;
    const outputMessage = hasThreeLayerData
      ? `${message}\n${JSON.stringify(outputData)}`
      : message;

    return terseToMcpToolResult(TerseOutput.success(outputMessage));
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
      TerseOutput.failure(error instanceof Error ? error.message : String(error))
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

    const unsubscribe = coreAPI.onMessage<T>(
      channel,
      (msg: MessageEnvelope<T>) => {
        const payload = msg.payload as { requestId?: string };
        if (payload.requestId === requestId) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(msg.payload);
        }
      }
    );
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
