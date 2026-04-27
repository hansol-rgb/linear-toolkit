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

interface ThreadMessage {
  user?: string;
  text?: string;
  ts?: string;
}

interface MessageContext {
  aiText: string;
  messages: ThreadMessage[];
}

async function getMessageContext(
  channel: string,
  ts: string,
): Promise<MessageContext | null> {
  const client = getSlackClient();

  // First try: fetch as a thread reply (conversations.replies)
  try {
    const replies = await client.conversations.replies({
      channel,
      ts,
      inclusive: true,
      limit: 50,
    });
    if (replies.messages && replies.messages.length > 0) {
      const messages = replies.messages.filter((m) => m.text) as ThreadMessage[];
      const aiText = messages.map((m) => m.text).join("\n\n");
      if (aiText.trim()) return { aiText, messages };
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
    if (message?.text) {
      return { aiText: message.text, messages: [message as ThreadMessage] };
    }
  } catch {
    // No access
  }

  return null;
}

function formatSlackTs(ts: string | undefined): string {
  if (!ts) return "";
  const seconds = parseFloat(ts);
  if (!Number.isFinite(seconds)) return "";
  const d = new Date(seconds * 1000);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

async function resolveUserDisplayName(
  userId: string | undefined,
  cache: Map<string, string>,
): Promise<string> {
  if (!userId) return "알 수 없음";
  const cached = cache.get(userId);
  if (cached) return cached;
  try {
    const slack = getSlackClient();
    const info = await slack.users.info({ user: userId });
    const profile = info.user?.profile;
    const name =
      profile?.display_name || info.user?.real_name || info.user?.name || userId;
    cache.set(userId, name);
    return name;
  } catch {
    cache.set(userId, userId);
    return userId;
  }
}

async function formatThreadComment(
  messages: ThreadMessage[],
  permalink: string | undefined,
): Promise<string> {
  const nameCache = new Map<string, string>();
  const lines: string[] = [];
  if (permalink) {
    lines.push(`슬랙 원본 스레드: ${permalink}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(`**스레드 대화 (${messages.length}개 메시지)**`);
  lines.push("");
  for (const m of messages) {
    const name = await resolveUserDisplayName(m.user, nameCache);
    const time = formatSlackTs(m.ts);
    lines.push(`**${name}**${time ? ` — ${time}` : ""}`);
    lines.push((m.text ?? "").trim());
    lines.push("");
  }
  return lines.join("\n");
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
  const context = await getMessageContext(event.item.channel, event.item.ts);
  if (!context) {
    console.log("Could not fetch message text");
    return;
  }
  const messageText = context.aiText;

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
  const issueUrl = await created.url;

  // Add Slack permalink + full thread as Linear comment
  try {
    const permalinkResult = await client.chat.getPermalink({
      channel: event.item.channel,
      message_ts: event.item.ts,
    });
    const commentBody = await formatThreadComment(
      context.messages,
      permalinkResult.permalink,
    );
    const { addComment } = await import("@/lib/linear/issues");
    await addComment(created.id, commentBody);
  } catch (err) {
    console.error("Failed to add thread comment:", err);
    // 코멘트 실패해도 이슈 생성은 완료
  }

  // Reply in thread
  await replyInThread(
    event.item.channel,
    event.item.ts,
    `Linear에 등록했어요: <${issueUrl}|${identifier}> — ${parsed.title}`,
  );
}
