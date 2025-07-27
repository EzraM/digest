export interface BaseEvent {
  id?: number;
  timestamp: number;
  sessionId: string;
  eventType: EventType;
  metadata: EventMetadata;
}

export type EventType = 
  | 'user_prompt'
  | 'model_call'
  | 'model_response'
  | 'block_operation'
  | 'response_parsing'
  | 'system_event';

export interface EventMetadata {
  requestId?: string;
  cost?: number;
  tokens?: number;
  timing?: {
    startTime: number;
    endTime?: number;
    duration?: number;
  };
  source?: string;
  [key: string]: any;
}

export interface UserPromptEvent extends BaseEvent {
  eventType: 'user_prompt';
  data: {
    prompt: string;
    context?: string;
  };
}

export interface ModelCallEvent extends BaseEvent {
  eventType: 'model_call';
  data: {
    systemPrompt: string;
    userPrompt: string;
    fullRequest: any;
  };
}

export interface ModelResponseEvent extends BaseEvent {
  eventType: 'model_response';
  data: {
    rawResponse: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export interface ResponseParsingEvent extends BaseEvent {
  eventType: 'response_parsing';
  data: {
    rawResponse: string;
    parsedXml?: any;
    proposedOperations: any[];
    parseSuccess: boolean;
    parseError?: string;
  };
}

export interface BlockOperationEvent extends BaseEvent {
  eventType: 'block_operation';
  data: {
    operations: any[];
    source: 'user' | 'ai' | 'sync';
    result: any;
    documentState?: any;
  };
}

export interface SystemEvent extends BaseEvent {
  eventType: 'system_event';
  data: {
    action: string;
    details: any;
  };
}

export type DigestEvent = 
  | UserPromptEvent
  | ModelCallEvent
  | ModelResponseEvent
  | ResponseParsingEvent
  | BlockOperationEvent
  | SystemEvent;

export interface EventFilter {
  eventTypes?: EventType[];
  sessionId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}