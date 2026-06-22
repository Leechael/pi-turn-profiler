export interface MessageUpdateEvent {
  message: any;
  assistantMessageEvent: {
    type: string;
  };
}

export interface MessageEndEvent {
  message: any;
}

export interface ToolExecutionStartEvent {
  toolCallId: string;
  toolName?: string;
  args?: unknown;
}

export interface ToolExecutionEndEvent {
  toolCallId: string;
  toolName?: string;
  args?: unknown;
}

export interface AgentEndEvent {
  messages: unknown[];
}
