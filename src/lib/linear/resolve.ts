import { getLinearClient } from './client';
import { getSlackClient } from '@/lib/slack/client';
import { withRetry } from './retry';

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
 * 프로젝트 이름으로 프로젝트 ID 찾기.
 * 1순위: 정확한 이름 매칭 (대소문자 무시)
 * 2순위: 프로젝트 이름이 입력값에 포함되거나 입력값이 프로젝트 이름에 포함 (양방향)
 *        — 단, 너무 짧은 매칭(<3자) 제외하여 'a'가 'Adobe'에 매칭되는 것 방지
 * 매칭 없으면 undefined (유저가 Linear에서 수동 지정)
 */
export async function resolveProjectId(projectName: string, teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const projects = await withRetry(
    () => client.projects({ filter: { accessibleTeams: { id: { eq: teamId } } } }),
    { label: `projects(team=${teamId})` },
  );

  const lowerName = projectName.toLowerCase().trim();
  if (lowerName.length < 2) return undefined;

  // 1순위: 정확 매칭
  const exact = projects.nodes.find((p) => p.name.toLowerCase() === lowerName);
  if (exact) return exact.id;

  // 2순위: 양방향 부분 매칭 (단, 짧은 이름 제외)
  const partial = projects.nodes.find((p) => {
    const pName = p.name.toLowerCase();
    if (pName.length < 3 || lowerName.length < 3) return false;
    return pName.includes(lowerName) || lowerName.includes(pName);
  });

  return partial?.id;
}

/**
 * 팀의 워크플로우 상태 중 특정 이름/타입 찾기
 */
export async function resolveStateId(
  teamId: string,
  stateName: string,
): Promise<string | undefined> {
  const client = getLinearClient();
  const team = await withRetry(() => client.team(teamId), { label: `team(${teamId})` });
  const states = await withRetry(() => team.states(), { label: `team(${teamId}).states` });

  const lowerName = stateName.toLowerCase();
  const match = states.nodes.find(
    (s) => s.name.toLowerCase() === lowerName
  );

  return match?.id;
}

/**
 * 팀의 시작 상태 ID 반환. "Todo" → "할 일" → type=unstarted → 첫번째 상태 순서로 폴백.
 */
export async function getTodoStateId(teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const team = await withRetry(() => client.team(teamId), { label: `team(${teamId})` });
  const states = await withRetry(() => team.states(), { label: `team(${teamId}).states` });

  const candidates = ['todo', '할 일', '할일'];
  for (const name of candidates) {
    const match = states.nodes.find((s) => s.name.toLowerCase() === name);
    if (match) return match.id;
  }

  // type=unstarted 가 Linear의 "시작 전" 그룹
  const unstarted = states.nodes.find((s) => s.type === 'unstarted');
  if (unstarted) return unstarted.id;

  return states.nodes[0]?.id;
}

/**
 * 팀의 프로젝트 목록을 텍스트로 반환 (AI 프롬프트에 포함용)
 */
export async function getProjectListForPrompt(teamId?: string): Promise<string> {
  const client = getLinearClient();
  const projects = await client.projects({
    ...(teamId && {
      filter: { accessibleTeams: { id: { eq: teamId } } },
    }),
  });

  if (projects.nodes.length === 0) return '';

  return projects.nodes.map((p) => p.name).join(', ');
}

/**
 * 프로젝트 이름으로 프로젝트 ID 찾기 (채널 힌트 기반, 더 유연한 매칭)
 */
export async function resolveProjectIdFromHint(hint: string, teamId: string): Promise<string | undefined> {
  const client = getLinearClient();
  const projects = await client.projects({
    filter: {
      accessibleTeams: { id: { eq: teamId } },
    },
  });

  const lowerHint = hint.toLowerCase().replace(/[_-]/g, ' ');

  // 1순위: 정확한 이름 매칭
  const exact = projects.nodes.find(
    (p) => p.name.toLowerCase() === lowerHint
  );
  if (exact) return exact.id;

  // 2순위: 부분 매칭 (양방향)
  const partial = projects.nodes.find(
    (p) => p.name.toLowerCase().includes(lowerHint) || lowerHint.includes(p.name.toLowerCase())
  );
  if (partial) return partial.id;

  // 3순위: 단어 단위 매칭 (adobe kr ↔ adobe)
  const words = lowerHint.split(' ');
  const wordMatch = projects.nodes.find(
    (p) => words.some((w) => w.length > 2 && p.name.toLowerCase().includes(w))
  );
  return wordMatch?.id;
}
