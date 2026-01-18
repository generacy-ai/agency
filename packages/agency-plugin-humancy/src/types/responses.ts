/**
 * Response types for Humancy plugin
 *
 * Defines the message types received from humans in response to requests.
 */

/**
 * Response to ask_question
 */
export interface QuestionResponse {
  /** Correlation with request */
  requestId: string;
  type: 'text';
  /** Human's freeform text response */
  response: string;
  /** When human responded */
  respondedAt: Date;
}

/**
 * Review approval status
 */
export enum ReviewStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CHANGES_REQUESTED = 'changes_requested',
}

/**
 * Response to request_review
 */
export interface ReviewResponse {
  /** Correlation with request */
  requestId: string;
  type: 'approval';
  /** Approval status */
  status: ReviewStatus;
  /** Required if rejected or changes_requested */
  comments?: string;
  /** When human responded */
  respondedAt: Date;
}

/**
 * Response to request_decision
 */
export interface DecisionResponse {
  /** Correlation with request */
  requestId: string;
  type: 'selection';
  /** ID of the selected option */
  selectedOption: string;
  /** When human responded */
  respondedAt: Date;
}

/**
 * Union of all response types
 */
export type HumancyResponse =
  | QuestionResponse
  | ReviewResponse
  | DecisionResponse;

/**
 * Timeout error details
 */
export interface TimeoutError {
  type: 'timeout';
  requestId: string;
  elapsedMs: number;
  configuredTimeoutMs: number;
  suggestion: string;
}
