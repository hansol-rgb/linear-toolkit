import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { sendDM } from '@/lib/slack/dm';
import { postToChannel } from '@/lib/slack/channel';
import { setConversation } from '@/lib/conversation/store';
import { setDailyThread } from '@/lib/conversation/store';
import type { ConversationState } from '@/lib/conversation/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamMembers = config.app.teamMembers;
  if (teamMembers.length === 0) {
    return NextResponse.json({ error: 'No team members configured' }, { status: 400 });
  }

  // Post daily scrum header to channel first
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const headerTs = await postToChannel(
    config.slack.scrumChannelId,
    `*${today} 데일리 스크럼*\n팀원들의 오늘 할 일이 여기에 실시간으로 업데이트됩니다.`
  );
  setDailyThread(headerTs);

  // Send DMs to all team members
  const now = Date.now();
  const results: Array<{ userId: string; success: boolean; error?: string }> = [];
  const greeting = '좋은 아침이에요! 오늘 할 일에 대해 간단히 알려주세요. 어제 진행한 것도 있으면 같이 말해주세요.';

  for (const userId of teamMembers) {
    try {
      const channelId = await sendDM(userId, greeting);

      const state: ConversationState = {
        userId,
        slackChannelId: channelId,
        status: 'awaiting_response',
        messages: [
          { role: 'assistant', content: greeting, timestamp: now },
        ],
        followUpCount: 0,
        createdAt: now,
        expiresAt: now + config.app.conversationTimeoutMs,
      };

      setConversation(userId, state);
      results.push({ userId, success: true });
    } catch (error) {
      results.push({
        userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ triggered: results.length, results });
}
