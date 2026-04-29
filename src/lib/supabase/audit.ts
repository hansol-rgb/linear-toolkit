import { getSupabaseClient } from "./client";

interface RecordDecisionParams {
  decisionType: "reaction_issue" | "interview_issue" | "status_change" | "sub_issue" | "parent_issue";
  slackUserId?: string;
  slackChannelId?: string;
  slackMessageTs?: string;
  inputText?: string;
  aiModel?: string;
  aiRawOutput?: unknown;
  finalDecision?: unknown;
  linearIssueIdentifier?: string;
  linearIssueId?: string;
}

// 봇 결정 audit log 기록 — 디버깅 + 정확도 분석용. 실패해도 메인 흐름엔 영향 없음.
export async function recordDecision(params: RecordDecisionParams): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("bot_decisions").insert({
      decision_type: params.decisionType,
      slack_user_id: params.slackUserId ?? null,
      slack_channel_id: params.slackChannelId ?? null,
      slack_message_ts: params.slackMessageTs ?? null,
      input_text: params.inputText ?? null,
      ai_model: params.aiModel ?? null,
      ai_raw_output: params.aiRawOutput ?? null,
      final_decision: params.finalDecision ?? null,
      linear_issue_identifier: params.linearIssueIdentifier ?? null,
      linear_issue_id: params.linearIssueId ?? null,
    });
    if (error) {
      console.error("recordDecision failed:", error);
    }
  } catch (err) {
    console.error("recordDecision threw:", err);
  }
}
