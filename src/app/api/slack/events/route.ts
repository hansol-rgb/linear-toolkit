import { NextResponse, after } from "next/server";
import {
  verifyRequestSignature,
  handleUrlVerification,
  routeEvent,
  parseEventPayload,
} from "@/lib/slack/events";
import type { SlackEventCallback, SlackUrlVerificationEvent } from "@/lib/slack/types";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  const payload = parseEventPayload(body);

  // URL verification — respond immediately without signature check
  if (payload.type === "url_verification") {
    const result = handleUrlVerification(payload as SlackUrlVerificationEvent);
    return NextResponse.json(result);
  }

  // Verify signature for all other requests
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!verifyRequestSignature(signingSecret, signature, timestamp, body)) {
    console.error("Invalid Slack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Event callback
  if (payload.type === "event_callback") {
    const eventPayload = payload as SlackEventCallback;
    after(async () => {
      try {
        await routeEvent(eventPayload);
        console.log("Event processed successfully");
      } catch (err) {
        console.error("Error routing Slack event:", err);
      }
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
