/**
 * humancy.notify tool
 *
 * Send a non-blocking notification to the human (fire-and-forget).
 */

import {
  type AgencyTool,
  type ToolResult,
  TerseOutput,
  terseToMcpToolResult,
  createMessageEnvelope,
  type AgencyCoreAPI,
} from '@generacy-ai/agency';
import {
  type NotifyParams,
  type NotificationRequest,
  notifyParamsSchema,
  Urgency,
} from '../types/index.js';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';

const CHANNEL_NAME = 'agency.humancy';

/**
 * Create the notify tool
 */
export function createNotifyTool(
  coreAPI: AgencyCoreAPI,
  detector: ConnectionModeDetector
): AgencyTool {
  return {
    name: 'humancy.notify',
    description:
      'Send a non-blocking notification to the human. Returns immediately without waiting for delivery confirmation. Use this to keep humans informed about progress.',
    namespace: 'humancy',
    outputPattern: 'terse',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The notification message',
        },
        context: {
          type: 'string',
          description: 'Additional context',
        },
        urgency: {
          type: 'string',
          enum: ['blocking_now', 'blocking_soon', 'when_available'],
          description:
            'Notification priority (default: when_available)',
        },
      },
      required: ['message'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      // Validate parameters
      const parseResult = notifyParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(
            `Invalid parameters: ${parseResult.error.message}`
          )
        );
      }

      const validParams: NotifyParams = parseResult.data;

      // Check connection mode - for notifications, we can still "send" in offline mode
      // They'll be queued by the channel router
      const mode = detector.getMode();

      // Build request
      const request: NotificationRequest = {
        id: crypto.randomUUID(),
        type: 'notification',
        message: validParams.message,
        context: validParams.context,
        urgency: validParams.urgency as Urgency ?? Urgency.WHEN_AVAILABLE,
        timestamp: new Date(),
      };

      // Create message envelope
      const envelope = createMessageEnvelope({
        channel: CHANNEL_NAME,
        sender: coreAPI.getPluginId(),
        payload: request,
      });

      try {
        // Fire-and-forget - don't wait for response
        coreAPI.sendMessage(CHANNEL_NAME, envelope);

        // Return immediately - delivery is handled by channel router
        if (mode === ConnectionMode.OFFLINE) {
          return terseToMcpToolResult(
            TerseOutput.success('queued (offline)')
          );
        }

        return terseToMcpToolResult(TerseOutput.success('sent'));
      } catch (error) {
        // Even for fire-and-forget, report if sending failed
        return terseToMcpToolResult(
          TerseOutput.failure(
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    },
  };
}
