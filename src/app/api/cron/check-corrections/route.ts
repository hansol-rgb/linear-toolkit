import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getLinearClient } from "@/lib/linear/client";
import { withRetry } from "@/lib/linear/retry";

export const dynamic = "force-dynamic";

interface BotDecisionRow {
  id: number;
  linear_issue_id: string;
  linear_issue_identifier: string | null;
  final_decision: {
    projectId?: string;
    teamId?: string;
    assigneeId?: string;
    priority?: number;
  } | null;
}

// 봇 결정과 현재 Linear 이슈 상태를 비교 — 차이가 있으면 issue_corrections에 기록.
// 매일 한 번 실행 (vercel.json cron). 최근 7일 내 결정 중 미체크 + 24시간 경과한 것만 검사.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const linear = getLinearClient();

  // 24시간 이상 경과 + 7일 이내 + 아직 체크 안 된 것
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: decisions, error: fetchErr } = await supabase
    .from("bot_decisions")
    .select("id, linear_issue_id, linear_issue_identifier, final_decision")
    .not("linear_issue_id", "is", null)
    .gte("created_at", sevenDaysAgo)
    .lt("created_at", oneDayAgo)
    .is("corrections_checked_at", null)
    .limit(100);

  if (fetchErr) {
    console.error("check-corrections: fetch decisions failed:", fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const rows = (decisions ?? []) as BotDecisionRow[];
  let checked = 0;
  let correctionsFound = 0;

  for (const d of rows) {
    try {
      const issue = await withRetry(() => linear.issue(d.linear_issue_id), {
        label: `linear.issue(${d.linear_issue_id})`,
      });
      if (!issue) continue;

      const project = await issue.project;
      const team = await issue.team;
      const assignee = await issue.assignee;

      const corrections: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      const orig = d.final_decision ?? {};

      if (orig.projectId !== undefined) {
        const currentProjectId = project?.id ?? null;
        if ((orig.projectId ?? null) !== currentProjectId) {
          corrections.push({
            field: "project_id",
            oldValue: orig.projectId ?? null,
            newValue: currentProjectId,
          });
        }
      }

      if (orig.teamId && team?.id && orig.teamId !== team.id) {
        corrections.push({
          field: "team_id",
          oldValue: orig.teamId,
          newValue: team.id,
        });
      }

      if (orig.assigneeId !== undefined) {
        const currentAssigneeId = assignee?.id ?? null;
        if ((orig.assigneeId ?? null) !== currentAssigneeId) {
          corrections.push({
            field: "assignee_id",
            oldValue: orig.assigneeId ?? null,
            newValue: currentAssigneeId,
          });
        }
      }

      if (orig.priority !== undefined && issue.priority !== undefined && orig.priority !== issue.priority) {
        corrections.push({
          field: "priority",
          oldValue: String(orig.priority),
          newValue: String(issue.priority),
        });
      }

      if (corrections.length > 0) {
        const inserts = corrections.map((c) => ({
          bot_decision_id: d.id,
          linear_issue_id: d.linear_issue_id,
          linear_issue_identifier: d.linear_issue_identifier,
          field_changed: c.field,
          old_value: c.oldValue,
          new_value: c.newValue,
        }));
        const { error: insErr } = await supabase.from("issue_corrections").insert(inserts);
        if (insErr) {
          console.error(`check-corrections: insert failed for decision ${d.id}:`, insErr);
        } else {
          correctionsFound += corrections.length;
        }
      }

      // 체크 완료 마킹
      await supabase
        .from("bot_decisions")
        .update({ corrections_checked_at: new Date().toISOString() })
        .eq("id", d.id);

      checked++;
    } catch (err) {
      console.error(`check-corrections: failed for decision ${d.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    decisionsChecked: checked,
    correctionsFound,
    decisionsScanned: rows.length,
  });
}
