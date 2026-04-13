import { NextResponse } from "next/server";
import {
  verifyRequestSignature,
  handleUrlVerification,
  routeEvent,
  parseEventPayload,
} from "@/lib/slack/events";
import type { SlackEventCallback, SlackUrlVerificationEvent } from "@/lib/slack/types";

// GET handler to verify this route is alive
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ route: "slack/events", status: "ok" });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  console.log("SLACK EVENT RECEIVED:", body.substring(0, 200));
  const payload = parseEventPayload(body);

  // URL verification challenge — respond immediately without signature check
  if (payload.type === "url_verification") {
    const result = handleUrlVerification(payload as SlackUrlVerificationEvent);
    return NextResponse.json(result);
  }

  // TODO: Re-enable signature verification after confirming events work
  // const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  // const signature = request.headers.get("x-slack-signature") ?? "";
  // const signingSecret = process.env.SLACK_SIGNING_SECRET;
  // if (signingSecret && !verifyRequestSignature(signingSecret, signature, timestamp, body)) {
  //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  // }

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
