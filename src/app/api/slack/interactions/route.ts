import { NextResponse, after } from "next/server";
import { verifyRequestSignature } from "@/lib/slack/events";
import type { SlackInteractionPayload, SlackAction } from "@/lib/slack/types";
import { getPendingIssue, deletePendingIssue } from "@/lib/slack/duplicate-check";
import { createIssue, addComment } from "@/lib/linear/issues";
import { sendDM } from "@/lib/slack/dm";

async function handleDuplicateUpdate(
  action: SlackAction,
  userId: string,
): Promise<void> {
  const { pendingKey, existingIssueId } = JSON.parse(action.value || "{}");
  const pending = getPendingIssue(pendingKey);
  if (!pending) {
    await sendDM(userId, "시간이 지나서 처리할 수 없어요. 다시 시도해주세요.");
    return;
  }

  await addComment(existingIssueId, `데일리 스크럼 업데이트:\n${pending.description}`);
  deletePendingIssue(pendingKey);
  await sendDM(userId, "기존 이슈에 업데이트했어요.");
}

async function handleDuplicateCreateNew(
  action: SlackAction,
  userId: string,
): Promise<void> {
  const { pendingKey } = JSON.parse(action.value || "{}");
  const pending = getPendingIssue(pendingKey);
  if (!pending) {
    await sendDM(userId, "시간이 지나서 처리할 수 없어요. 다시 시도해주세요.");
    return;
  }

  const created = await createIssue(pending);
  const identifier = await created.identifier;
  deletePendingIssue(pendingKey);
  await sendDM(userId, `새 이슈로 생성했어요: *${identifier}* — ${pending.title}`);
}

async function handleDuplicateSkip(
  action: SlackAction,
  userId: string,
): Promise<void> {
  const { pendingKey } = JSON.parse(action.value || "{}");
  deletePendingIssue(pendingKey);
  await sendDM(userId, "건너뛰었어요.");
}

async function routeInteraction(
  payload: SlackInteractionPayload,
): Promise<void> {
  if (payload.type === "block_actions" && payload.actions) {
    for (const action of payload.actions) {
      switch (action.action_id) {
        case "duplicate_update":
          await handleDuplicateUpdate(action, payload.user.id);
          break;
        case "duplicate_create_new":
          await handleDuplicateCreateNew(action, payload.user.id);
          break;
        case "duplicate_skip":
          await handleDuplicateSkip(action, payload.user.id);
          break;
        case "satisfaction_rating":
          // TODO: satisfaction survey
          break;
        default:
          break;
      }
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!verifyRequestSignature(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr) as SlackInteractionPayload;

  after(async () => {
    try {
      await routeInteraction(payload);
    } catch (err) {
      console.error("Error handling Slack interaction:", err);
    }
  });

  return NextResponse.json({ ok: true });
}
