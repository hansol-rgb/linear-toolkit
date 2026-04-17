import { createHmac, timingSafeEqual } from "crypto";
import type {
  SlackEventCallback,
  SlackEventPayload,
  SlackMessageEvent,
  SlackUrlVerificationEvent,
} from "./types";
import { sendDM } from "./dm";
import { replyInThread } from "./channel";
import {
  getConversation,
  setConversation,
  deleteConversation,
  getDailyThread,
} from "@/lib/conversation/store";
import type { ConversationState } from "@/lib/conversation/types";
import { generateInterviewResponse, shouldEndConversation } from "@/lib/ai/interview";
import { classifyIntent } from "@/lib/ai/intent";
import { executeCommand } from "@/lib/slack/commands";
import { extractIssues } from "@/lib/ai/extract-issues";
import { createIssue, addComment } from "@/lib/linear/issues";
import { getTeams } from "@/lib/linear/teams";
import { ensureLabels } from "@/lib/linear/labels";
import { applyTemplate } from "@/lib/ai/apply-template";
import { resolveProjectId, resolveLinearUserId, getTodoStateId } from "@/lib/linear/resolve";
import { handleDuplicateResponse, hasPendingDuplicate } from "@/lib/slack/duplicate-check";
import { handleProjectResponse, hasPendingProjectSelection } from "@/lib/slack/ask-project";
import { config } from "@/lib/config";

// Event deduplication: in-memory Map with TTL
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const processedEvents = new Map<string, number>();

function isDuplicate(eventId: string): boolean {
  const now = Date.now();

  // Prune expired entries
  for (const [id, expiry] of processedEvents) {
    if (now > expiry) {
      processedEvents.delete(id);
    }
  }

  if (processedEvents.has(eventId)) {
    return true;
  }

  processedEvents.set(eventId, now + DEDUP_TTL_MS);
  return false;
}

export function verifyRequestSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  const sigBuffer = Buffer.from(mySignature, "utf8");
  const compareBuffer = Buffer.from(signature, "utf8");

  if (sigBuffer.length !== compareBuffer.length) {
    return false;
  }

  return timingSafeEqual(sigBuffer, compareBuffer);
}

export function handleUrlVerification(
  event: SlackUrlVerificationEvent
): { challenge: string } {
  return { challenge: event.challenge };
}

interface ProcessedIssue {
  identifier: string;
  url: string;
  title: string;
}

async function processConversationEnd(conversation: ConversationState): Promise<{ issues: ProcessedIssue[]; errors: string[] }> {
  const issues: ProcessedIssue[] = [];
  const errors: string[] = [];

  try {
    const teams = await getTeams();
    if (teams.length === 0) {
      errors.push("Linear 팀 정보를 가져오지 못했어요.");
      return { issues, errors };
    }

    const extracted = await extractIssues(conversation.messages, "AUTO");

    for (const issue of extracted) {
      if (issue.confidence < 0.7) continue;

      const team = teams.find((t) => t.key === issue.teamKey) || teams[0];

      try {
        const labelIds = issue.labels?.length
          ? await ensureLabels(team.id, issue.labels)
          : undefined;

        let description = issue.description;
        const conversationText = conversation.messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n");
        const templateResult = await applyTemplate(conversationText, team.key);
        if (templateResult) {
          description = templateResult.filledContent;
        }

        // 프로젝트 자동 매칭만 시도. 안 맞으면 프로젝트 없이 생성 (Linear에서 나중에 설정 가능).
        const projectId = issue.projectName
          ? await resolveProjectId(issue.projectName, team.id)
          : undefined;

        const stateId = await getTodoStateId(team.id);
        const assigneeId = await resolveLinearUserId(conversation.userId);

        const pendingIssue = {
          title: issue.title,
          description,
          teamId: team.id,
          projectId,
          stateId,
          priority: issue.priority,
          estimate: issue.estimate ?? undefined,
          dueDate: issue.dueDate,
          labelIds,
          assigneeId,
        };

        // 기존 이슈 업데이트로 명시된 경우만 업데이트, 나머지는 무조건 신규 생성.
        // (중복 감지는 유사 키워드만으로 거짓양성 많아서 비활성화 — Linear UI에서 사람이 판단)
        if (issue.isExistingIssue && issue.existingIssueIdentifier) {
          const { getIssueByIdentifier } = await import("@/lib/linear/issues");
          const existing = await getIssueByIdentifier(issue.existingIssueIdentifier);
          if (existing) {
            await addComment(existing.id, `데일리 스크럼 업데이트:\n${description}`);
            issues.push({
              identifier: existing.identifier,
              url: existing.url,
              title: existing.title,
            });
            continue;
          }
        }

        const created = await createIssue(pendingIssue);
        issues.push({
          identifier: created.identifier,
          url: created.url,
          title: created.title,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        console.error(`Failed to create issue "${issue.title}":`, err);
        errors.push(`"${issue.title}" 생성 실패: ${msg}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Error processing issues:", error);
    errors.push(`이슈 추출 실패: ${msg}`);
  }

  return { issues, errors };
}

export async function handleDMMessage(
  event: SlackMessageEvent
): Promise<void> {
  const userId = event.user;
  const text = event.text;
  const now = Date.now();

  // Ignore all bot messages — check subtype, bot_id, and bot_profile
  if (event.subtype === "bot_message" || event.bot_id || event.app_id) return;

  try {
    // 프로젝트 선택 대기 중이면 그 응답 처리
    if (hasPendingProjectSelection(userId)) {
      await handleProjectResponse(userId, text);
      return;
    }

    // 중복 확인 대기 중이면 그 응답 처리
    if (hasPendingDuplicate(userId)) {
      await handleDuplicateResponse(userId, text);
      return;
    }

    // 진행 중인 대화가 없으면 먼저 의도 분류
    const existingConversation = getConversation(userId);

    if (!existingConversation) {
      const intent = await classifyIntent(text);

      if (intent.type === "command") {
        await executeCommand(userId, intent);
        return;
      }
    }

    let conversation = existingConversation;

    // No active conversation — start a new interview
    if (!conversation) {
      conversation = {
        userId,
        slackChannelId: event.channel,
        status: "awaiting_response",
        messages: [],
        followUpCount: 0,
        createdAt: now,
        expiresAt: now + config.app.conversationTimeoutMs,
      };
    }

    // Add user message
    conversation.messages.push({ role: "user", content: text, timestamp: now });

    // Check if conversation should end
    const shouldEnd = await shouldEndConversation(conversation.messages);

    // follow-up 최대 1회. 그 이후 유저 응답이 오면 바로 이슈 생성 + 마무리.
    // (이전엔 2였는데 AI가 마무리 인사를 보낸 다음 턴에야 종료되는 버그 있었음)
    if (shouldEnd || conversation.followUpCount >= 1) {
      conversation.status = "completed";
      setConversation(userId, conversation);

      // Extract issues and create in Linear
      const { issues, errors } = await processConversationEnd(conversation);

      // Send closing message via DM (Slack-formatted clickable links)
      let closingMessage = "감사합니다! 좋은 하루 보내세요.";
      if (issues.length > 0) {
        const lines = issues.map((i) => `• <${i.url}|${i.identifier}>: ${i.title}`).join("\n");
        closingMessage += `\n\nLinear에 등록된 이슈:\n${lines}`;
      }
      if (errors.length > 0) {
        closingMessage += `\n\n⚠️ 일부 이슈 생성 실패:\n${errors.map((e) => `• ${e}`).join("\n")}`;
      }
      await sendDM(userId, closingMessage);

      // Post to daily scrum channel thread immediately
      const threadTs = await getDailyThread();
      if (threadTs) {
        const conversationText = conversation.messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n");

        const issueDetails = issues.map(
          (i) => `• <${i.url}|${i.identifier}>: ${i.title}`,
        );

        // AI로 이슈로 안 만든 항목만 추출 (회의, 1on1 등)
        const { chat: chatFn } = await import("@/lib/ai/client");
        const issueTitles = issues.map((i) => i.title).join(", ");
        const otherItems = await chatFn(
          `대화 내용에서 이미 이슈로 만들어진 항목을 제외하고, 이슈로 만들지 않은 기타 할 일(회의, 1on1, 싱크, 리마인더 등)만 불릿 포인트(•)로 정리하세요. 없으면 빈 문자열만 출력. 인사말이나 설명 없이 리스트만.

이미 이슈로 만든 항목: ${issueTitles || "없음"}`,
          [{ role: "user", content: conversationText }],
        );

        // 포맷: 이슈 링크 + 기타 항목
        let threadMessage = `*<@${userId}>*`;
        if (issueDetails.length > 0) {
          threadMessage += `\n${issueDetails.join("\n")}`;
        }
        if (otherItems.trim()) {
          threadMessage += `\n${otherItems.trim()}`;
        }

        await replyInThread(
          config.slack.scrumChannelId,
          threadTs,
          threadMessage,
        );
      }

      deleteConversation(userId);
      return;
    }

    // Generate AI follow-up response
    conversation.status = "follow_up";
    conversation.followUpCount++;

    const aiResponse = await generateInterviewResponse(
      conversation.messages,
      conversation.followUpCount
    );

    conversation.messages.push({ role: "assistant", content: aiResponse, timestamp: Date.now() });
    setConversation(userId, conversation);

    await sendDM(userId, aiResponse);
  } catch (error) {
    console.error("handleDMMessage error:", error);
    // AI 실패해도 최소한 응답은 보내기
    await sendDM(userId, `죄송해요, 일시적인 오류가 발생했어요. 다시 메시지 보내주세요.\n\n오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }
}

export async function routeEvent(
  payload: SlackEventCallback
): Promise<void> {
  if (isDuplicate(payload.event_id)) {
    return;
  }

  const { event } = payload;

  if (event.type === "message" && event.channel_type === "im" && !event.subtype) {
    await handleDMMessage(event as SlackMessageEvent);
  }

  if (event.type === "reaction_added") {
    const { handleReactionAdded } = await import("./reactions");
    const raw = event as unknown as { user: string; reaction: string; item: { type: string; channel: string; ts: string } };
    await handleReactionAdded({
      user: raw.user,
      reaction: raw.reaction,
      item: raw.item,
    });
  }
}

export function parseEventPayload(body: string): SlackEventPayload {
  return JSON.parse(body) as SlackEventPayload;
}
