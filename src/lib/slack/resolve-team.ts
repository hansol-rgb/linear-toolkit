import { getSlackClient } from "./client";

/**
 * 슬랙 채널명을 기반으로 Linear 팀 키를 결정합니다.
 * - project_ 로 시작하는 채널 → PROJ
 * - product_ 로 시작하는 채널 → PRD
 * - DM (im) → AI 판단에 위임 (null 반환)
 */
export async function resolveTeamKeyFromChannel(channelId: string): Promise<string | null> {
  try {
    const client = getSlackClient();
    const info = await client.conversations.info({ channel: channelId });
    const channelName = info.channel?.name?.toLowerCase();

    if (!channelName) return null;

    if (channelName.startsWith("project_") || channelName.startsWith("project-")) {
      return "PROJ";
    }
    if (channelName.startsWith("product_") || channelName.startsWith("product-")) {
      return "PRD";
    }

    return null;
  } catch {
    // DM 채널이거나 접근 권한 없으면 null
    return null;
  }
}
