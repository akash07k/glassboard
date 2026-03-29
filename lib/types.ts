export interface Project {
  id: string;
  friendlyName: string;
}

export interface SessionSummary {
  sessionId: string;
  date: string;
  label: string;
  lineCount: number;
}

interface MessageBase {
  timestamp: string | null;
  turnIndex: number;
}

export type ParsedMessage =
  | UserMessage
  | AssistantText
  | AssistantThinking
  | ToolCall
  | ToolResult
  | SystemMessage
  | LocalCommand
  | QueuedMessage;

export interface LocalCommand extends MessageBase {
  type: "local_command";
  command: string;
  output: string;
}

export interface QueuedMessage extends MessageBase {
  type: "queued";
  text: string;
}

export interface UserMessage extends MessageBase {
  type: "user";
  text: string;
}

export interface AssistantText extends MessageBase {
  type: "assistant_text";
  text: string;
}

export interface AssistantThinking extends MessageBase {
  type: "assistant_thinking";
  text: string;
}

export interface ToolCall extends MessageBase {
  type: "tool_call";
  toolUseId: string;
  toolName: string;
  description: string;
  input: string;
}

export interface ToolResult extends MessageBase {
  type: "tool_result";
  toolUseId: string;
  content: string;
}

export interface SystemMessage extends MessageBase {
  type: "system";
  subtype: string;
  text: string;
}

export interface PaginatedResponse {
  messages: ParsedMessage[];
  totalCount: number;
  startIndex: number;
  endIndex: number;
  hasMore: boolean;
}

export interface SoundEventConfig {
  enabled: boolean;
  announce: boolean;
  notify: boolean;
  file: string;
  volume: number;
  repeatInterval: number;
  repeatCount: number;
}

export interface AppDefaults {
  toggles: Record<string, boolean>;
  renderMarkdown: boolean;
  exportFormat: string;
  pagination: {
    messagesPerPage: number;
    snapToTurnBoundary: boolean;
  };
  sounds: {
    enabled: boolean;
    profile: string;
    volume: number;
    soundWhenBackground: boolean;
    notifyWhenFocused: boolean;
    notifyMaxLength: number;
    events: Record<string, SoundEventConfig>;
  };
}

export interface AppConfig {
  port: number;
  defaults: AppDefaults;
}
