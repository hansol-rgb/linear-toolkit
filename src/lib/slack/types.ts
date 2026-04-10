// Slack Event API types

export interface SlackUrlVerificationEvent {
  type: "url_verification";
  token: string;
  challenge: string;
}

export interface SlackEventCallback {
  type: "event_callback";
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  event_id: string;
  event_time: number;
}

export type SlackEventPayload = SlackUrlVerificationEvent | SlackEventCallback;

export interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  ts?: string;
  channel?: string;
  channel_type?: string;
  event_ts?: string;
  subtype?: string;
}

export interface SlackMessageEvent extends SlackEvent {
  type: "message";
  user: string;
  text: string;
  ts: string;
  channel: string;
  channel_type: string;
}

// Slack Interactive Payload types

export interface SlackInteractionPayload {
  type: "block_actions" | "view_submission" | "view_closed";
  trigger_id: string;
  user: SlackInteractionUser;
  actions?: SlackAction[];
  view?: SlackView;
  container?: SlackContainer;
  channel?: { id: string; name: string };
  message?: SlackInteractionMessage;
}

export interface SlackInteractionUser {
  id: string;
  username: string;
  name: string;
  team_id: string;
}

export interface SlackAction {
  action_id: string;
  block_id: string;
  type: string;
  value?: string;
  selected_option?: { value: string };
  action_ts: string;
}

export interface SlackView {
  id: string;
  type: string;
  title: { type: string; text: string };
  callback_id?: string;
  state?: { values: Record<string, Record<string, unknown>> };
}

export interface SlackContainer {
  type: string;
  message_ts?: string;
  channel_id?: string;
}

export interface SlackInteractionMessage {
  ts: string;
  text: string;
  blocks?: unknown[];
}

// Daily Scrum types

export interface TeamMemberSummary {
  slackUserId: string;
  displayName: string;
  items: string[];
  linearIssueLinks: string[];
  responded: boolean;
}
