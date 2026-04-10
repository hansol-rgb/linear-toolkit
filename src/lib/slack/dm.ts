import type { KnownBlock, Block } from "@slack/web-api";
import { getSlackClient } from "./client";

export async function sendDM(
  userId: string,
  text: string
): Promise<string> {
  const client = getSlackClient();

  const openResult = await client.conversations.open({ users: userId });
  const channelId = openResult.channel?.id;
  if (!channelId) {
    throw new Error(`Failed to open DM channel with user ${userId}`);
  }

  const result = await client.chat.postMessage({
    channel: channelId,
    text,
  });

  if (!result.ts) {
    throw new Error("Failed to send DM: no message timestamp returned");
  }

  return result.ts;
}

export async function sendDMWithBlocks(
  userId: string,
  blocks: (KnownBlock | Block)[]
): Promise<string> {
  const client = getSlackClient();

  const openResult = await client.conversations.open({ users: userId });
  const channelId = openResult.channel?.id;
  if (!channelId) {
    throw new Error(`Failed to open DM channel with user ${userId}`);
  }

  const result = await client.chat.postMessage({
    channel: channelId,
    blocks,
    text: "You have a new message", // fallback for notifications
  });

  if (!result.ts) {
    throw new Error("Failed to send DM with blocks: no message timestamp returned");
  }

  return result.ts;
}
