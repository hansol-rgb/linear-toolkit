import { NextResponse, after } from "next/server";
import { verifyRequestSignature } from "@/lib/slack/events";
import type { SlackInteractionPayload } from "@/lib/slack/types";

async function routeInteraction(
  payload: SlackInteractionPayload,
): Promise<void> {
  if (payload.type === "block_actions" && payload.actions) {
    for (const action of payload.actions) {
      switch (action.action_id) {
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
