import fs from "fs";
import path from "path";
import { getSlackClient } from "./client";
import { replyInThread } from "./channel";
import { chatStructured, AI_MODEL_SMART } from "@/lib/ai/client";
import { createIssue } from "@/lib/linear/issues";
import { getTeams } from "@/lib/linear/teams";
import { ensureLabels } from "@/lib/linear/labels";
import { applyTemplate } from "@/lib/ai/apply-template";
import { resolveProjectId, resolveProjectIdFromHint, resolveLinearUserId, getTodoStateId, getProjectListForPrompt } from "@/lib/linear/resolve";
import { resolveChannelContext } from "./resolve-team";

const PROMPT_PATH = path.join(process.cwd(), "src/prompts/reaction-issue.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// Emoji → action mapping
const EMOJI_ACTIONS: Record<string, { type: string; priority: number }> = {
  "task": { type: "이슈", priority: 3 },
  "emoji-task": { type: "이슈", priority: 3 },
  "clipboard": { type: "이슈", priority: 3 },
  "memo": { type: "이슈", priority: 3 },
  "bug": { type: "버그", priority: 2 },
  "zap": { type: "긴급", priority: 1 },
  "pushpin": { type: "이슈", priority: 3 },
};

const REACTION_ISSUE_SCHEMA = {
  name: 'create_issue_from_message',
  description: 'Create a Linear issue from a Slack message',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: '구체적이고 액션 가능한 이슈 제목' },
      description: { type: 'string', description: '마크다운 형식의 상세 설명' },
      labels: { type: 'array', items: { type: 'string' } },
      projectName: { type: ['string', 'null'], description: '관련 클라이언트/프로젝트 이름 (Adobe KR, Hecto 등)' },
      estimate: { type: ['number', 'null'], description: '예상 작업량 (1=작음, 2=보통, 3=큼, 5=매우 큼)' },
      priority: { type: 'number', enum: [1, 2, 3, 4] },
      teamKey: { type: 'string', enum: ['PRD', 'PROJ'], description: '이슈를 등록할 팀' },
    },
    required: ['title', 'description', 'priority', 'teamKey'],
  },
};

async function getMessageContext(
  channel: string,
  ts: string,
): Promise<string | null> {
  const client = getSlackClient();

  // First try: fetch as a thread reply (conversations.replies)
  try {
    const replies = await client.conversations.replies({
      channel,
      ts,
      inclusive: true,
      limit: 20,
    });
    if (replies.messages && replies.messages.length > 0) {
      // Collect all messages in the thread for full context
      const allText = replies.messages
        .filter((m) => m.text)
        .map((m) => m.text)
        .join("\n\n");
      if (allText.trim()) return allText;
    }
  } catch {
    // Not a thread, fall through
  }

  // Fallback: fetch single message from channel history
  try {
    const result = await client.conversations.history({
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    const message = result.messages?.[0];
    if (message?.text) return message.text;
  } catch {
    // No access
  }

  return null;
}

export async function handleReactionAdded(event: {
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
}): Promise<void> {
  console.log("REACTION:", event.reaction, "from", event.user);
  const action = EMOJI_ACTIONS[event.reaction];
  if (!action) {
    console.log("Reaction not in EMOJI_ACTIONS, skipping:", event.reaction);
    return;
  }

  const client = getSlackClient();

  // Get the full message context (including thread if applicable)
  const messageText = await getMessageContext(event.item.channel, event.item.ts);
  if (!messageText) {
    console.log("Could not fetch message text");
    return;
  }

  console.log("Message text for issue:", messageText.substring(0, 200));

  // Check if we already created an issue for this message
  try {
    const threadReplies = await client.conversations.replies({
      channel: event.item.channel,
      ts: event.item.ts,
      limit: 10,
    });
    const alreadyProcessed = threadReplies.messages?.some(
      (m) => m.bot_id && m.text?.includes("Linear에 등록")
    );
    if (alreadyProcessed) return;
  } catch {
    // Ignore errors checking for duplicates
  }

  // Get all teams + resolve team and project from channel name
  const teams = await getTeams();
  if (teams.length === 0) return;
  const channelCtx = await resolveChannelContext(event.item.channel);
  const projectList = await getProjectListForPrompt();

  // AI extracts structured issue from the message — use SMART model for quality
  const parsed = await chatStructured<{
    title: string;
    description: string;
    labels?: string[];
    projectName?: string;
    estimate?: number;
    priority?: number;
    teamKey?: string;
  }>(
    `오늘 날짜: ${new Date().toISOString().slice(0, 10)}\n이슈 유형: ${action.type}\n등록된 프로젝트: ${projectList || '없음'}\n\n${getSystemPrompt()}`,
    [{ role: "user", content: messageText }],
    REACTION_ISSUE_SCHEMA,
    AI_MODEL_SMART,
  );

  // 채널명 우선, 없으면 AI 판단
  const effectiveTeamKey = channelCtx.teamKey || parsed.teamKey;
  const team = teams.find((t) => t.key === effectiveTeamKey) || teams[0];

  // Ensure labels exist
  const labelIds = parsed.labels?.length
    ? await ensureLabels(team.id, parsed.labels)
    : undefined;

  // Try to apply a template
  let description = parsed.description;
  const templateResult = await applyTemplate(messageText, team.key);
  if (templateResult) {
    description = templateResult.filledContent;
  }

  // Resolve project: 채널 힌트 → AI 판단 순
  let projectId: string | undefined;
  if (channelCtx.projectHint) {
    projectId = await resolveProjectIdFromHint(channelCtx.projectHint, team.id);
  }
  if (!projectId && parsed.projectName) {
    projectId = await resolveProjectId(parsed.projectName, team.id);
  }
  const stateId = await getTodoStateId(team.id);
  const assigneeId = await resolveLinearUserId(event.user);

  // Create Linear issue
  const created = await createIssue({
    title: parsed.title,
    description: `${description}\n\n---\n_슬랙 메시지에서 :${event.reaction}: 이모지로 자동 생성됨_`,
    teamId: team.id,
    projectId,
    stateId,
    priority: parsed.priority ?? action.priority,
    estimate: parsed.estimate ?? undefined,
    labelIds,
    assigneeId,
  });
  const identifier = await created.identifier;

  // Reply in thread
  await replyInThread(
    event.item.channel,
    event.item.ts,
    `Linear에 등록했어요: *${identifier}* — ${parsed.title}`,
  );
}
