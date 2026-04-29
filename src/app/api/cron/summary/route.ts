import { NextResponse } from 'next/server';
import { clearCompletedConversations } from '@/lib/conversation/store';

export const dynamic = 'force-dynamic';

// Deadline cron — closes remaining conversations for the day.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await clearCompletedConversations();

  return NextResponse.json({ ok: true });
}
