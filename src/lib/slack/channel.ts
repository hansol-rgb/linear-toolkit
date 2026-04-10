import { getSlackClient } from "./client";
import type { TeamMemberSummary } from "./types";

export async function postToChannel(
  channelId: string,
  text: string
): Promise<string> {
  const client = getSlackClient();

  const result = await client.chat.postMessage({
    channel: channelId,
    text,
  });

  if (!result.ts) {
    throw new Error("Failed to post to channel: no message timestamp returned");
  }

  return result.ts;
}

export async function replyInThread(
  channelId: string,
  threadTs: string,
  text: string
): Promise<string> {
  const client = getSlackClient();

  const result = await client.chat.postMessage({
    channel: channelId,
    text,
    thread_ts: threadTs,
  });

  if (!result.ts) {
    throw new Error("Failed to reply in thread: no message timestamp returned");
  }

  return result.ts;
}

function formatSummaryHeader(summaries: TeamMemberSummary[]): string {
  const respondedCount = summaries.filter((s) => s.responded).length;
  const total = summaries.length;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `*Daily Scrum Summary* -- ${today}\n${respondedCount}/${total} team members responded`;
}

function formatMemberSummary(summary: TeamMemberSummary): string {
  if (!summary.responded) {
    return `*<@${summary.slackUserId}>* -- _did not respond_`;
  }

  const items = summary.items.map((item) => `  - ${item}`).join("\n");
  const links =
    summary.linearIssueLinks.length > 0
      ? `\n  Linear: ${summary.linearIssueLinks.join(", ")}`
      : "";

  return `*<@${summary.slackUserId}>*\n${items}${links}`;
}

export async function postDailySummary(
  channelId: string,
  summaries: TeamMemberSummary[]
): Promise<void> {
  const headerText = formatSummaryHeader(summaries);
  const mainTs = await postToChannel(channelId, headerText);

  for (const summary of summaries) {
    const memberText = formatMemberSummary(summary);
    await replyInThread(channelId, mainTs, memberText);
  }
}
