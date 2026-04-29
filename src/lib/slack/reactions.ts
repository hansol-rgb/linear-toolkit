import fs from "fs";
import path from "path";
import { getSlackClient } from "./client";
import { replyInThread } from "./channel";
import { chatStructured, AI_MODEL_SMART } from "@/lib/ai/client";
import { createIssue, updateIssue, getIssueByIdentifier, attachSlackThread, addComment } from "@/lib/linear/issues";
import { getTeams } from "@/lib/linear/teams";
import { ensureLabels } from "@/lib/linear/labels";
import { applyTemplate } from "@/lib/ai/apply-template";
import { resolveProjectId, resolveProjectIdFromHint, resolveLinearUserId, getTodoStateId, getProjectListForPrompt, resolveStateId } from "@/lib/linear/resolve";
import { resolveChannelContext } from "./resolve-team";
import { recordChannelContext } from "@/lib/supabase/channel-context";
import { recordDecision } from "@/lib/supabase/audit";
import { getUserPreferences } from "@/lib/supabase/preferences";

const PROMPT_PATH = path.join(process.cwd(), "src/prompts/reaction-issue.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// 이슈 생성 이모지 — todo-linear가 메인, bug/zap은 별도 트리거 (버그/긴급)
const EMOJI_ACTIONS: Record<string, { type: string; priority: number }> = {
  "todo-linear": { type: "이슈", priority: 3 },
  "bug": { type: "버그", priority: 2 },
  "zap": { type: "긴급", priority: 1 },
};

// 상태 변경 이모지 → Linear 워크플로우 상태 이름
const STATUS_EMOJIS: Record<string, string> = {
  "in-progress-linear": "In Progress",
  "in-review-linear": "In Review",
  "done-linear": "Done",
};

// 부모 이슈 등록 이모지
const PARENT_EMOJIS = new Set(["parent-issue-linear"]);

// 봇 메시지에서 "부모 이슈" 마커를 식별 — sub-issue 생성 시 부모 ID 찾는 데 사용
const PARENT_MARKER = "📁 부모 이슈로 등록";
const SUB_MARKER = "↳ Sub-이슈";

// 봇이 이슈 등록 후 스레드에 남긴 메시지에서 PROJ-42 같은 identifier 추출
function extractIssueIdentifierFromBotReply(text: string): string | undefined {
  const match = text.match(/<https?:\/\/linear\.app\/[^|>]+\|([A-Z]+-\d+)>/);
  return match?.[1];
}

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

// 메시지 본문 안의 슬랙 인코딩 멘션을 사람이 읽을 수 있는 형태로 치환
// <@U123>            → @displayname
// <@U123|fallback>   → @displayname (fallback 무시하고 실제 이름 조회)
// <!subteam^S123|x>  → @x
// <!channel|...>, <!here|...>, <!everyone|...> → @channel / @here / @everyone
async function resolveSlackMentionsInText(
  text: string,
  cache: Map<string, string>,
): Promise<string> {
  if (!text) return text;
  let result = text;

  const userMentions = Array.from(result.matchAll(/<@(U[A-Z0-9]+)(?:\|[^>]+)?>/g));
  const uniqueIds = Array.from(new Set(userMentions.map((m) => m[1])));
  await Promise.all(uniqueIds.map((id) => resolveUserDisplayName(id, cache)));
  for (const id of uniqueIds) {
    const name = cache.get(id) ?? id;
    result = result.replaceAll(
      new RegExp(`<@${id}(?:\\|[^>]+)?>`, "g"),
      `@${name}`,
    );
  }

  result = result.replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_, label) =>
    label ? `@${label}` : "@team",
  );
  result = result.replace(/<!(channel|here|everyone)(?:\|[^>]+)?>/g, "@$1");

  return result;
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
    const body = await resolveSlackMentionsInText((m.text ?? "").trim(), nameCache);
    lines.push(`**${name}**${time ? ` — ${time}` : ""}`);
    lines.push(body);
    lines.push("");
  }
  return lines.join("\n");
}

// 같은 스레드에서 봇이 남긴 부모 이슈 메시지를 찾아 identifier 추출
async function findParentIssueIdentifierInThread(
  channel: string,
  ts: string,
): Promise<string | undefined> {
  const client = getSlackClient();
  try {
    const replies = await client.conversations.replies({
      channel,
      ts,
      limit: 100,
    });
    for (const m of replies.messages ?? []) {
      if (!m.bot_id || !m.text) continue;
      if (m.text.includes(PARENT_MARKER)) {
        const id = extractIssueIdentifierFromBotReply(m.text);
        if (id) return id;
      }
    }
  } catch (err) {
    console.error("findParentIssueIdentifierInThread failed:", err);
  }
  return undefined;
}

// 이 메시지(ts)에 대해 이미 봇이 이슈를 만들었는지 — [src:TS] 마커로 per-message dedup
async function alreadyProcessedForMessage(
  channel: string,
  ts: string,
): Promise<boolean> {
  const client = getSlackClient();
  try {
    const replies = await client.conversations.replies({
      channel,
      ts,
      limit: 100,
    });
    return !!replies.messages?.some(
      (m) => m.bot_id && m.text?.includes(`[src:${ts}]`),
    );
  } catch {
    return false;
  }
}

async function handleStatusChangeReaction(
  event: { reaction: string; item: { channel: string; ts: string } },
  targetStateName: string,
): Promise<void> {
  const client = getSlackClient();

  // 이 메시지에서 만든 이슈를 정확히 타깃 — [src:TS] 태그로 매칭
  // 매칭 실패 시 폴백으로 스레드 첫 봇 답글의 이슈 (단일 이슈 스레드 호환)
  let identifier: string | undefined;
  let fallback: string | undefined;
  try {
    const replies = await client.conversations.replies({
      channel: event.item.channel,
      ts: event.item.ts,
      limit: 50,
    });
    for (const m of replies.messages ?? []) {
      if (!m.bot_id || !m.text) continue;
      const id = extractIssueIdentifierFromBotReply(m.text);
      if (!id) continue;
      if (m.text.includes(`[src:${event.item.ts}]`)) {
        identifier = id;
        break;
      }
      if (!fallback) fallback = id;
    }
    identifier = identifier || fallback;
  } catch (err) {
    console.error("Failed to fetch thread replies for status change:", err);
    return;
  }

  if (!identifier) {
    console.log("No Linear issue identifier found in thread, skipping status change");
    return;
  }

  const issue = await getIssueByIdentifier(identifier);
  if (!issue) {
    console.log(`Issue ${identifier} not found in Linear, skipping`);
    return;
  }

  const team = await issue.team;
  if (!team) return;

  const stateId = await resolveStateId(team.id, targetStateName);
  if (!stateId) {
    console.log(`State "${targetStateName}" not found for team ${team.key}`);
    return;
  }

  // 이미 해당 상태면 스킵 — 중복 알림/업데이트 방지
  const currentState = await issue.state;
  if (currentState?.id === stateId) {
    console.log(`Issue ${identifier} already in ${targetStateName}, skipping`);
    return;
  }

  await updateIssue(issue.id, { stateId });

  await recordDecision({
    decisionType: "status_change",
    slackChannelId: event.item.channel,
    slackMessageTs: event.item.ts,
    finalDecision: {
      from: currentState?.name,
      to: targetStateName,
      reaction: event.reaction,
      teamId: team.id,
      teamKey: team.key,
    },
    linearIssueIdentifier: identifier,
    linearIssueId: issue.id,
  });

  await replyInThread(
    event.item.channel,
    event.item.ts,
    `*${identifier}* → *${targetStateName}* 으로 상태 변경했어요.`,
  );
}

export async function handleReactionAdded(event: {
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
}): Promise<void> {
  console.log("REACTION:", event.reaction, "from", event.user);

  // 상태 변경 이모지 — 스레드에 이미 등록된 이슈가 있으면 상태만 바꿈
  const statusTarget = STATUS_EMOJIS[event.reaction];
  if (statusTarget) {
    await handleStatusChangeReaction(event, statusTarget);
    return;
  }

  // 부모 이모지 vs 일반 task 이모지 판별
  const isParentEmoji = PARENT_EMOJIS.has(event.reaction);
  const action = isParentEmoji
    ? { type: "이슈", priority: 3 }
    : EMOJI_ACTIONS[event.reaction];
  if (!action) {
    console.log("Reaction not recognized, skipping:", event.reaction);
    return;
  }

  // 같은 메시지 중복 처리 방지 (per-message dedup)
  if (await alreadyProcessedForMessage(event.item.channel, event.item.ts)) {
    console.log("Message already processed, skipping:", event.item.ts);
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

  // 일반 task 이모지면 같은 스레드에 부모 이슈가 있는지 찾아서 sub-issue로 매달기
  let parentIssueId: string | undefined;
  let parentIdentifier: string | undefined;
  if (!isParentEmoji) {
    parentIdentifier = await findParentIssueIdentifierInThread(
      event.item.channel,
      event.item.ts,
    );
    if (parentIdentifier) {
      const parent = await getIssueByIdentifier(parentIdentifier);
      if (parent) {
        parentIssueId = parent.id;
      }
    }
  }

  // Get all teams + resolve team and project from channel name + 사용자 선호 미리 fetch
  const teams = await getTeams();
  if (teams.length === 0) return;
  const channelCtx = await resolveChannelContext(event.item.channel);
  const projectList = await getProjectListForPrompt();
  const userPrefs = await getUserPreferences(event.user);

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

  // 채널명 → AI 판단 → 사용자 선호 → 첫 팀 순
  const effectiveTeamKey =
    channelCtx.teamKey || parsed.teamKey || userPrefs?.defaultTeamKey;
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

  // Resolve project: 채널 힌트 → AI 판단 → 사용자별 채널 히스토리 순
  let projectId: string | undefined;
  if (channelCtx.projectHint) {
    projectId = await resolveProjectIdFromHint(channelCtx.projectHint, team.id);
  }
  if (!projectId && parsed.projectName) {
    projectId = await resolveProjectId(parsed.projectName, team.id);
  }
  if (!projectId) {
    const channelPref = userPrefs?.mostCommonProjectIdPerChannel?.[event.item.channel];
    if (channelPref) projectId = channelPref;
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
    parentId: parentIssueId,
  });
  const identifier = await created.identifier;
  const issueUrl = await created.url;

  // 채널 컨텍스트 기록 — 단계 2 자동 프로젝트 예측을 위한 학습 데이터
  await recordChannelContext({
    channelId: event.item.channel,
    slackUserId: event.user,
    linearProjectId: projectId,
    linearTeamId: team.id,
    linearIssueIdentifier: identifier,
  });

  // 결정 audit log
  await recordDecision({
    decisionType: isParentEmoji ? "parent_issue" : (parentIdentifier ? "sub_issue" : "reaction_issue"),
    slackUserId: event.user,
    slackChannelId: event.item.channel,
    slackMessageTs: event.item.ts,
    inputText: messageText,
    aiModel: AI_MODEL_SMART,
    aiRawOutput: parsed,
    finalDecision: {
      title: parsed.title,
      teamId: team.id,
      teamKey: team.key,
      projectId,
      projectName: parsed.projectName,
      stateId,
      priority: parsed.priority ?? action.priority,
      estimate: parsed.estimate,
      labelIds,
      assigneeId,
      parentId: parentIssueId,
      parentIdentifier,
      reaction: event.reaction,
    },
    linearIssueIdentifier: identifier,
    linearIssueId: created.id,
  });

  // Linear의 공식 Slack 통합으로 스레드 네이티브 동기화 (1순위) — 실패 시 마크다운 폴백
  try {
    const permalinkResult = await client.chat.getPermalink({
      channel: event.item.channel,
      message_ts: event.item.ts,
    });
    const permalink = permalinkResult.permalink;
    if (!permalink) throw new Error("Slack permalink 없음");

    try {
      await attachSlackThread(created.id, permalink, {
        title: `Slack: ${parsed.title.substring(0, 80)}`,
      });
    } catch (attachErr) {
      console.warn("attachmentLinkSlack 실패, markdown 코멘트로 폴백:", attachErr);
      const commentBody = await formatThreadComment(context.messages, permalink);
      await addComment(created.id, commentBody);
    }
  } catch (err) {
    console.error("Slack 스레드 첨부 전체 실패 (이슈 생성은 완료):", err);
  }

  // Reply in thread — 부모 / 서브 / 일반에 따라 마커 + per-message dedup 태그 [src:TS]
  const dedupTag = `[src:${event.item.ts}]`;
  let replyText: string;
  if (isParentEmoji) {
    replyText = `${PARENT_MARKER}: <${issueUrl}|${identifier}> — ${parsed.title}\n_답글에 :emoji-task: 등 누르면 이 이슈의 sub-issue로 등록됩니다_ ${dedupTag}`;
  } else if (parentIdentifier) {
    replyText = `${SUB_MARKER}: <${issueUrl}|${identifier}> (부모: ${parentIdentifier}) — ${parsed.title} ${dedupTag}`;
  } else {
    replyText = `Linear에 등록했어요: <${issueUrl}|${identifier}> — ${parsed.title} ${dedupTag}`;
  }
  await replyInThread(event.item.channel, event.item.ts, replyText);
}
