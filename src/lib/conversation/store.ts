import { ConversationState } from './types';

// In-memory store for development. Replace with Vercel KV (Upstash Redis) for production.
const conversations = new Map<string, ConversationState>();

// Daily scrum thread — find today's daily message from the channel
import { getSlackClient } from '@/lib/slack/client';
import { config } from '@/lib/config';

// In-memory cache (same instance only)
let dailyThreadTsCache: string | null = null;
let dailyThreadDateCache: string | null = null;

export function setDailyThread(ts: string): void {
  dailyThreadTsCache = ts;
  dailyThreadDateCache = new Date().toISOString().slice(0, 10);
}

export async function getDailyThread(): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. 캐시에 있으면 바로 반환
  if (dailyThreadDateCache === today && dailyThreadTsCache) {
    return dailyThreadTsCache;
  }

  // 2. 캐시에 없으면 슬랙 채널에서 오늘의 데일리 메시지 검색
  try {
    const client = getSlackClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await client.conversations.history({
      channel: config.slack.scrumChannelId,
      oldest: String(todayStart.getTime() / 1000),
      limit: 10,
    });

    // 봇이 오늘 올린 "데일리 스크럼" 메시지 찾기
    const dailyMsg = result.messages?.find(
      (m) => m.bot_id && m.text?.includes('데일리 스크럼')
    );

    if (dailyMsg?.ts) {
      dailyThreadTsCache = dailyMsg.ts;
      dailyThreadDateCache = today;
      return dailyMsg.ts;
    }
  } catch {
    // 채널 접근 실패 시 아래로 진행
  }

  // 3. 오늘 데일리 메시지가 없으면 직접 생성
  try {
    const { postToChannel } = await import('@/lib/slack/channel');
    const todayStr = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    const client = getSlackClient();
    const result = await client.chat.postMessage({
      channel: config.slack.scrumChannelId,
      text: `*${todayStr} 데일리 스크럼*\n팀원들의 오늘 할 일이 여기에 실시간으로 업데이트됩니다.`,
    });
    if (result.ts) {
      dailyThreadTsCache = result.ts;
      dailyThreadDateCache = today;
      return result.ts;
    }
  } catch {
    // 생성 실패
  }

  return null;
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
