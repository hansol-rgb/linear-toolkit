import { sendDM } from "./dm";
import { findSimilarIssues } from "@/lib/linear/search";
import { createIssue, addComment } from "@/lib/linear/issues";
import { chat, AI_MODEL_FAST } from "@/lib/ai/client";
import {
  getConversation,
  setConversation,
  deleteConversation,
} from "@/lib/conversation/store";
import type { ConversationState } from "@/lib/conversation/types";
import type { IssueSearchResult } from "@linear/sdk";

export interface PendingIssue {
  title: string;
  description: string;
  teamId: string;
  projectId?: string;
  stateId?: string;
  priority?: number;
  estimate?: number;
  dueDate?: string;
  labelIds?: string[];
  assigneeId?: string;
}

// 유저별 대기 중인 이슈 + 중복 후보
const pendingDuplicates = new Map<string, {
  pendingIssue: PendingIssue;
  existingIssue: IssueSearchResult;
}>();

/**
 * 중복 이슈 확인. 비슷한 이슈가 있으면 대화로 확인 요청.
 * 반환값: 유사 이슈가 있어서 확인 요청을 보냈으면 해당 이슈, 없으면 null
 */
export async function checkDuplicateAndAsk(
  userId: string,
  title: string,
  teamId: string,
  pendingIssue: PendingIssue,
): Promise<IssueSearchResult | null> {
  const similar = await findSimilarIssues(title, teamId);

  if (similar.length === 0) return null;

  const topMatch = similar[0];

  // 대기 상태 저장
  pendingDuplicates.set(userId, {
    pendingIssue,
    existingIssue: topMatch,
  });

  await sendDM(
    userId,
    `비슷한 이슈가 이미 있어요:\n*${topMatch.identifier}*: ${topMatch.title}\n\n새로 만들려는 이슈: *${title}*\n\n기존 이슈를 업데이트할까요, 새로 만들까요? (업데이트 / 새로 만들어줘 / 건너뛰기)`,
  );

  return topMatch;
}

/**
 * 중복 확인 대기 중인 유저의 응답 처리.
 * 반환값: 처리했으면 true, 대기 중인 게 없으면 false
 */
export async function handleDuplicateResponse(
  userId: string,
  text: string,
): Promise<boolean> {
  const pending = pendingDuplicates.get(userId);
  if (!pending) return false;

  const response = await chat(
    `사용자의 응답을 분류하세요. "update", "create", "skip" 중 하나만 답하세요.
- 기존 이슈 업데이트/기존 거/업데이트 → update
- 새로 만들어/새 이슈/새로 → create
- 건너뛰기/됐어/괜찮아/아니야 → skip`,
    [{ role: 'user', content: text }],
    AI_MODEL_FAST,
  );

  const action = response.trim().toLowerCase();
  const { pendingIssue, existingIssue } = pending;
  pendingDuplicates.delete(userId);

  if (action.includes("update")) {
    await addComment(existingIssue.id, `데일리 스크럼 업데이트:\n${pendingIssue.description}`);
    await sendDM(userId, `*${existingIssue.identifier}* 에 업데이트했어요.`);
  } else if (action.includes("create")) {
    const created = await createIssue(pendingIssue);
    const identifier = await created.identifier;
    await sendDM(userId, `새 이슈로 생성했어요: *${identifier}* — ${pendingIssue.title}`);
  } else {
    await sendDM(userId, "건너뛰었어요.");
  }

  return true;
}

/**
 * 유저가 중복 확인 대기 상태인지 체크
 */
export function hasPendingDuplicate(userId: string): boolean {
  return pendingDuplicates.has(userId);
}
