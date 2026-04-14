import { getLinearClient } from './client';
import { getSlackClient } from '@/lib/slack/client';

/**
 * Slack User ID → Linear User ID 매핑
 * 1순위: 이메일 매칭 (가장 정확)
 * 2순위: displayName 매칭 (폴백)
 */
export async function resolveLinearUserId(slackUserId: string): Promise<string | undefined> {
  try {
    const slack = getSlackClient();
    const slackUser = await slack.users.info({ user: slackUserId });
    const profile = slackUser.user?.profile;
    const slackEmail = profile?.email;
    const slackName = profile?.display_name || slackUser.user?.real_name || slackUser.user?.name;

    const client = getLinearClient();
    const users = await client.users();

    // 1순위: 이메일 매칭
    if (slackEmail) {
      const emailMatch = users.nodes.find(
        (u) => u.email?.toLowerCase() === slackEmail.toLowerCase()
      );
      if (emailMatch) return emailMatch.id;
    }

    // 2순위: displayName 매칭
    if (slackName) {
      const lowerName = slackName.toLowerCase();
      const nameMatch = users.nodes.find(
        (u) => u.displayName.toLowerCase() === lowerName
          || u.name.toLowerCase() === lowerName
          || u.name.toLowerCase().includes(lowerName)
          || lowerName.includes(u.displayName.toLowerCase())
      );
      if (nameMatch) return nameMatch.id;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 프로젝트 이름으로 프로젝트 ID 찾기 (부분 매칭)
 */
export async function resolveProjectId(projectName: string, teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const projects = await client.projects({
    filter: {
      accessibleTeams: { id: { eq: teamId } },
    },
  });

  const lowerName = projectName.toLowerCase();
  const match = projects.nodes.find(
    (p) => p.name.toLowerCase().includes(lowerName) || lowerName.includes(p.name.toLowerCase())
  );

  return match?.id;
}

/**
 * 팀의 워크플로우 상태 중 특정 이름/타입 찾기
 */
export async function resolveStateId(
  teamId: string,
  stateName: string,
): Promise<string | undefined> {
  const client = getLinearClient();
  const team = await client.team(teamId);
  const states = await team.states();

  const lowerName = stateName.toLowerCase();
  const match = states.nodes.find(
    (s) => s.name.toLowerCase() === lowerName
  );

  return match?.id;
}

/**
 * 팀의 "Todo" 상태 ID 반환 (기본 상태)
 */
export async function getTodoStateId(teamId: string): Promise<string | undefined> {
  return resolveStateId(teamId, 'Todo');
}
