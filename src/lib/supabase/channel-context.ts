import { getSupabaseClient } from "./client";

interface RecordParams {
  channelId: string;
  slackUserId: string;
  linearProjectId?: string;
  linearTeamId?: string;
  linearIssueIdentifier?: string;
}

// 이슈 생성 결과를 기록 — 단계 2(자동 프로젝트 예측)의 학습 데이터.
// 실패해도 이슈 생성 자체는 영향 없도록 throw 하지 않음.
export async function recordChannelContext(params: RecordParams): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("channel_project_history").insert({
      channel_id: params.channelId,
      slack_user_id: params.slackUserId,
      linear_project_id: params.linearProjectId ?? null,
      linear_team_id: params.linearTeamId ?? null,
      linear_issue_identifier: params.linearIssueIdentifier ?? null,
    });
    if (error) {
      console.error("recordChannelContext failed:", error);
    }
  } catch (err) {
    console.error("recordChannelContext threw:", err);
  }
}
