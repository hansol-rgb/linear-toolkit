import { getSlackClient } from "./client";
import { replyInThread } from "./channel";
import { chat } from "@/lib/ai/client";
import { createIssue } from "@/lib/linear/issues";
import { getTeams } from "@/lib/linear/teams";

// Emoji → action mapping
const EMOJI_ACTIONS: Record<string, { type: string; priority: number }> = {
  "clipboard": { type: "이슈", priority: 3 },        // 📋
  "memo": { type: "이슈", priority: 3 },              // 📝
  "bug": { type: "버그", priority: 2 },               // 🐛
  "zap": { type: "긴급", priority: 1 },               // ⚡
  "pushpin": { type: "이슈", priority: 3 },            // 📌
};

export async function handleReactionAdded(event: {
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
}): Promise<void> {
  const action = EMOJI_ACTIONS[event.reaction];
  if (!action) return;

  const client = getSlackClient();

  // Fetch the original message
  const result = await client.conversations.history({
    channel: event.item.channel,
    latest: event.item.ts,
    inclusive: true,
    limit: 1,
  });

  const message = result.messages?.[0];
  if (!message || !message.text) return;

  // Check if we already created an issue for this message (look for bot reply in thread)
  const threadReplies = await client.conversations.replies({
    channel: event.item.channel,
    ts: event.item.ts,
    limit: 10,
  });
  const alreadyProcessed = threadReplies.messages?.some(
    (m) => m.bot_id && m.text?.includes("Linear에 등록")
  );
  if (alreadyProcessed) return;

  // Get default team
  const teams = await getTeams();
  const team = teams[0];
  if (!team) return;

  // AI extracts issue title and description from the message
  const aiResult = await chat(
    `슬랙 메시지를 Linear 이슈로 변환하세요. 이슈 유형: ${action.type}
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드펜스 없이 순수 JSON만:
{"title": "간결한 이슈 제목", "description": "상세 설명"}`,
    [{ role: "user", content: message.text }],
  );

  const cleaned = aiResult.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
  const { title, description } = JSON.parse(cleaned) as { title: string; description: string };

  // Create Linear issue
  const created = await createIssue({
    title,
    description: `${description}\n\n---\n_슬랙 메시지에서 자동 생성됨_`,
    teamId: team.id,
    priority: action.priority,
  });
  const identifier = await created.identifier;

  // Reply in thread
  await replyInThread(
    event.item.channel,
    event.item.ts,
    `Linear에 등록했어요: *${identifier}* — ${title}`,
  );
}
