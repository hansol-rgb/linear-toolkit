import { NextResponse } from "next/server";
import { refreshUserPreferencesFromHistory } from "@/lib/supabase/preferences";

export const dynamic = "force-dynamic";

// 매일 한 번 사용자별 선호를 bot_decisions 히스토리에서 재계산.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshUserPreferencesFromHistory();
  return NextResponse.json({ ok: true, ...result });
}
