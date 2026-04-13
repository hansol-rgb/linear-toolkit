import { NextResponse, after } from "next/server";
import {
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

  // URL verification challenge
  if (payload.type === "url_verification") {
    const result = handleUrlVerification(payload as SlackUrlVerificationEvent);
    return NextResponse.json(result);
  }

  // Event callback — use after() to keep function alive after responding
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
