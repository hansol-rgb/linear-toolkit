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
import { extractIssues } from "@/lib/ai/extract-issues";
import { createIssue, addComment } from "@/lib/linear/issues";
import { findSimilarIssues } from "@/lib/linear/search";
import { findTeamByKey } from "@/lib/linear/teams";
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

async function processConversationEnd(conversation: ConversationState): Promise<string[]> {
  const issueLinks: string[] = [];

  try {
    const extracted = await extractIssues(conversation.messages, "PROJECT");

    for (const issue of extracted) {
      if (issue.confidence < 0.7) continue;

      const team = await findTeamByKey(issue.teamKey);
      if (!team) continue;

      // Check for duplicates
      const similar = await findSimilarIssues(issue.title, team.id);
      if (similar.length > 0 && issue.isExistingIssue && similar[0].identifier) {
        await addComment(similar[0].id, `데일리 스크럼 업데이트:\n${issue.description}`);
        issueLinks.push(similar[0].identifier);
      } else {
        const created = await createIssue({
          title: issue.title,
          description: issue.description,
          teamId: team.id,
          priority: issue.priority,
          dueDate: issue.dueDate,
        });
        const identifier = await created.identifier;
        issueLinks.push(identifier);
      }
    }
  } catch (error) {
    console.error("Error processing issues:", error);
  }

  return issueLinks;
}

export async function handleDMMessage(
  event: SlackMessageEvent
): Promise<void> {
  const userId = event.user;
  const text = event.text;
  const now = Date.now();

  // Ignore bot messages
  if (event.subtype === "bot_message") return;

  let conversation = getConversation(userId);

  // No active conversation — start an ad-hoc one
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

  if (shouldEnd || conversation.followUpCount >= 2) {
    conversation.status = "completed";
    setConversation(userId, conversation);

    // Extract issues and create in Linear
    const issueLinks = await processConversationEnd(conversation);

    // Send closing message via DM
    let closingMessage = "감사합니다! 좋은 하루 보내세요.";
    if (issueLinks.length > 0) {
      closingMessage += `\n\nLinear에 등록된 이슈: ${issueLinks.join(", ")}`;
    }
    await sendDM(userId, closingMessage);

    // Post to daily scrum channel thread immediately
    const threadTs = getDailyThread();
    if (threadTs) {
      const items = conversation.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content);
      const summary = items.join("\n");
      const issueText = issueLinks.length > 0
        ? `\nLinear: ${issueLinks.join(", ")}`
        : "";
      await replyInThread(
        config.slack.scrumChannelId,
        threadTs,
        `*<@${userId}>*\n${summary}${issueText}`
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
}

export function parseEventPayload(body: string): SlackEventPayload {
  return JSON.parse(body) as SlackEventPayload;
}
