import { getSlackClient } from "./client";

export interface ChannelContext {
  teamKey: string | null;
  projectHint: string | null;  // 채널명에서 추출한 프로젝트 힌트
}

/**
 * 슬랙 채널명을 기반으로 Linear 팀 키와 프로젝트 힌트를 결정합니다.
 *
 * 채널명 예시:
 * - project_adobe_kr → teamKey: PROJ, projectHint: "adobe kr"
 * - product_general → teamKey: PRD, projectHint: null
 * - project_hecto → teamKey: PROJ, projectHint: "hecto"
 */
export async function resolveChannelContext(channelId: string): Promise<ChannelContext> {
  try {
    const client = getSlackClient();
    const info = await client.conversations.info({ channel: channelId });
    const channelName = info.channel?.name?.toLowerCase();

    if (!channelName) return { teamKey: null, projectHint: null };

    if (channelName.startsWith("project_") || channelName.startsWith("project-")) {
      const projectPart = channelName.replace(/^project[_-]/, "").replace(/[_-]/g, " ");
      return {
        teamKey: "PROJ",
        projectHint: projectPart || null,
      };
    }

    if (channelName.startsWith("product_") || channelName.startsWith("product-")) {
      const projectPart = channelName.replace(/^product[_-]/, "").replace(/[_-]/g, " ");
      const isGeneric = ["general", "all", "team"].includes(projectPart);
      return {
        teamKey: "PRD",
        projectHint: isGeneric ? null : projectPart || null,
      };
    }

    return { teamKey: null, projectHint: null };
  } catch {
    return { teamKey: null, projectHint: null };
  }
}

// 하위 호환용
export async function resolveTeamKeyFromChannel(channelId: string): Promise<string | null> {
  const ctx = await resolveChannelContext(channelId);
  return ctx.teamKey;
}
