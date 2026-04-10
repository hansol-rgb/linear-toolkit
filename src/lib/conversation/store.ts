import { ConversationState } from './types';

// In-memory store for development. Replace with Vercel KV (Upstash Redis) for production.
const conversations = new Map<string, ConversationState>();

// Daily scrum thread — the main message ts for today's daily scrum channel post
let dailyThreadTs: string | null = null;
let dailyThreadDate: string | null = null;

export function setDailyThread(ts: string): void {
  dailyThreadTs = ts;
  dailyThreadDate = new Date().toISOString().slice(0, 10);
}

export function getDailyThread(): string | null {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyThreadDate !== today) return null;
  return dailyThreadTs;
}

export function getConversation(userId: string): ConversationState | null {
  const state = conversations.get(userId);
  if (!state) return null;

  if (Date.now() > state.expiresAt) {
    conversations.delete(userId);
    return null;
  }

  return state;
}

export function setConversation(userId: string, state: ConversationState): void {
  conversations.set(userId, state);
}

export function deleteConversation(userId: string): void {
  conversations.delete(userId);
}

export function getAllActiveConversations(): ConversationState[] {
  const now = Date.now();
  const active: ConversationState[] = [];

  for (const [userId, state] of conversations) {
    if (now > state.expiresAt) {
      conversations.delete(userId);
      continue;
    }
    active.push(state);
  }

  return active;
}

export function getCompletedConversations(): ConversationState[] {
  return Array.from(conversations.values()).filter(
    (s) => s.status === 'completed'
  );
}

export function clearCompletedConversations(): void {
  for (const [userId, state] of conversations) {
    if (state.status === 'completed') {
      conversations.delete(userId);
    }
  }
}
