import { getSlackClient } from "./client";
import type { KnownBlock } from "@slack/web-api";
import { findSimilarIssues } from "@/lib/linear/search";
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

// 유저 응답 대기 중인 이슈 저장 (interaction에서 처리)
const pendingIssues = new Map<string, PendingIssue>();

export function storePendingIssue(key: string, issue: PendingIssue): void {
  pendingIssues.set(key, issue);
  // 1시간 후 자동 삭제
  setTimeout(() => pendingIssues.delete(key), 3600000);
}

export function getPendingIssue(key: string): PendingIssue | undefined {
  return pendingIssues.get(key);
}

export function deletePendingIssue(key: string): void {
  pendingIssues.delete(key);
}

/**
 * 중복 이슈 확인. 비슷한 이슈가 있으면 유저에게 DM으로 확인 요청.
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
  const pendingKey = `${userId}-${Date.now()}`;
  storePendingIssue(pendingKey, pendingIssue);

  const client = getSlackClient();
  const openResult = await client.conversations.open({ users: userId });
  const channelId = openResult.channel?.id;
  if (!channelId) return null;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `비슷한 이슈가 이미 있어요:\n*${topMatch.identifier}*: ${topMatch.title}\n\n새로 만들려는 이슈: *${title}*`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "기존 이슈에 업데이트" },
          action_id: "duplicate_update",
          value: JSON.stringify({ pendingKey, existingIssueId: topMatch.id }),
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "새 이슈로 생성" },
          action_id: "duplicate_create_new",
          value: JSON.stringify({ pendingKey }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "건너뛰기" },
          action_id: "duplicate_skip",
          value: JSON.stringify({ pendingKey }),
        },
      ],
    },
  ];

  await client.chat.postMessage({
    channel: channelId,
    text: `비슷한 이슈가 있어요: ${topMatch.identifier}`,
    blocks,
  });

  return topMatch;
}
