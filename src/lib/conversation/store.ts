import { ConversationState, ConversationMessage, ConversationStatus } from './types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getSlackClient } from '@/lib/slack/client';
import { config } from '@/lib/config';

// 데일리 스크럼 스레드 ts — 인스턴스별 캐시. 콜드 스타트 시 슬랙 API로 재조회/재생성하므로 영속화 불필요.
let dailyThreadTsCache: string | null = null;
let dailyThreadDateCache: string | null = null;

export function setDailyThread(ts: string): void {
  dailyThreadTsCache = ts;
  dailyThreadDateCache = new Date().toISOString().slice(0, 10);
}

export async function getDailyThread(): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  if (dailyThreadDateCache === today && dailyThreadTsCache) {
    return dailyThreadTsCache;
  }

  try {
    const client = getSlackClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await client.conversations.history({
      channel: config.slack.scrumChannelId,
      oldest: String(todayStart.getTime() / 1000),
      limit: 10,
    });

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

  try {
    const client = getSlackClient();
    const todayStr = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
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

interface ConversationRow {
  user_id: string;
  slack_channel_id: string;
  status: string;
  messages: ConversationMessage[];
  follow_up_count: number;
  created_at: string;
  expires_at: string;
}

function rowToState(row: ConversationRow): ConversationState {
  return {
    userId: row.user_id,
    slackChannelId: row.slack_channel_id,
    status: row.status as ConversationStatus,
    messages: row.messages,
    followUpCount: row.follow_up_count,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
  };
}

export async function getConversation(userId: string): Promise<ConversationState | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('getConversation failed:', error);
    return null;
  }
  if (!data) return null;
  const state = rowToState(data as ConversationRow);
  if (Date.now() > state.expiresAt) {
    await deleteConversation(userId);
    return null;
  }
  return state;
}

export async function setConversation(userId: string, state: ConversationState): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('conversations').upsert(
    {
      user_id: userId,
      slack_channel_id: state.slackChannelId,
      status: state.status,
      messages: state.messages,
      follow_up_count: state.followUpCount,
      created_at: new Date(state.createdAt).toISOString(),
      expires_at: new Date(state.expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('setConversation failed:', error);
  }
}

export async function deleteConversation(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('conversations').delete().eq('user_id', userId);
  if (error) {
    console.error('deleteConversation failed:', error);
  }
}

export async function getAllActiveConversations(): Promise<ConversationState[]> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  // 만료된 행은 별도 cleanup 호출 없이 select에서 제외 (lazy cleanup은 clearExpiredConversations에서 일괄)
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .gt('expires_at', nowIso);
  if (error) {
    console.error('getAllActiveConversations failed:', error);
    return [];
  }
  return (data as ConversationRow[]).map(rowToState);
}

export async function getCompletedConversations(): Promise<ConversationState[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('status', 'completed');
  if (error) {
    console.error('getCompletedConversations failed:', error);
    return [];
  }
  return (data as ConversationRow[]).map(rowToState);
}

export async function clearCompletedConversations(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('status', 'completed');
  if (error) {
    console.error('clearCompletedConversations failed:', error);
  }
}
