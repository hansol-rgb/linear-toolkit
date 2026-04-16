import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import {
  getAllActiveConversations,
  clearCompletedConversations,
  getDailyThread,
} from '@/lib/conversation/store';
import { replyInThread } from '@/lib/slack/channel';

export const dynamic = 'force-dynamic';

// Deadline cron (10:00 KST) — posts non-respondents and closes remaining conversations
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threadTs = await getDailyThread();
  if (!threadTs) {
    return NextResponse.json({ message: 'No daily thread found' });
  }

  // Find members who haven't completed their interview
  const active = getAllActiveConversations();
  const respondedUserIds = new Set(active.filter((c) => c.status === 'completed').map((c) => c.userId));
  const timedOutUserIds = new Set(active.filter((c) => c.status !== 'completed').map((c) => c.userId));

  // Collect all members who didn't respond at all
  const nonRespondents = config.app.teamMembers.filter(
    (id) => !respondedUserIds.has(id) && !timedOutUserIds.has(id)
  );

  // Post non-respondents to thread
  if (nonRespondents.length > 0 || timedOutUserIds.size > 0) {
    const noResponseList = [...nonRespondents, ...timedOutUserIds]
      .map((id) => `<@${id}>`)
      .join(', ');
    await replyInThread(
      config.slack.scrumChannelId,
      threadTs,
      `_미응답: ${noResponseList}_`
    );
  }

  clearCompletedConversations();

  return NextResponse.json({
    nonRespondents: nonRespondents.length,
    timedOut: timedOutUserIds.size,
  });
}
