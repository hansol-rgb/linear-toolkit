import { NextResponse } from "next/server";
import {
  verifyRequestSignature,
  handleUrlVerification,
  routeEvent,
  parseEventPayload,
} from "@/lib/slack/events";
import type { SlackEventCallback, SlackUrlVerificationEvent } from "@/lib/slack/types";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (!verifyRequestSignature(signingSecret, signature, timestamp, body)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const payload = parseEventPayload(body);

  // URL verification challenge
  if (payload.type === "url_verification") {
    const result = handleUrlVerification(payload as SlackUrlVerificationEvent);
    return NextResponse.json(result);
  }

  // Event callback -- respond immediately, process in background
  if (payload.type === "event_callback") {
    const eventPayload = payload as SlackEventCallback;

    // Fire and forget: don't await so Slack gets a fast 200
    routeEvent(eventPayload).catch((err) => {
      console.error("Error routing Slack event:", err);
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
