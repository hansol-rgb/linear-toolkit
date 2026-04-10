export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
}

export type ConversationStatus =
  | 'awaiting_response'
  | 'follow_up'
  | 'completed'
  | 'timeout';

export interface ConversationState {
  userId: string;
  slackChannelId: string;
  status: ConversationStatus;
  messages: ConversationMessage[];
  followUpCount: number;
  createdAt: number;
  expiresAt: number;
}
