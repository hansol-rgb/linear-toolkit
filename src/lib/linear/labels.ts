import type { IssueLabel } from "@linear/sdk";
import { getLinearClient } from "./client";

export async function getLabels(teamId: string): Promise<IssueLabel[]> {
  const client = getLinearClient();
  const labels = await client.issueLabels({
    filter: { team: { id: { eq: teamId } } },
  });
  return labels.nodes;
}

export async function findLabelByName(
  teamId: string,
  name: string
): Promise<IssueLabel | null> {
  const labels = await getLabels(teamId);
  const lowerName = name.toLowerCase();
  return labels.find((l) => l.name.toLowerCase() === lowerName) ?? null;
}

export async function ensureLabels(
  teamId: string,
  names: string[]
): Promise<string[]> {
  const client = getLinearClient();
  const labelIds: string[] = [];

  for (const name of names) {
    // 같은 이름 라벨을 워크스페이스 전체에서 검색 (팀 레벨 라벨과 워크스페이스 레벨 라벨 포함)
    const found = await client.issueLabels({
      filter: { name: { eqIgnoreCase: name } },
    });

    // 현재 팀에 속한 라벨 또는 워크스페이스 레벨 라벨(team=null)만 사용 가능.
    // 다른 팀에 속한 라벨은 이슈에 붙이면 "LabelIds for incorrect team" 에러.
    let match: string | null = null;
    let workspaceLevel: string | null = null;
    for (const label of found.nodes) {
      const labelTeam = await label.team;
      if (!labelTeam) {
        workspaceLevel = label.id;
      } else if (labelTeam.id === teamId) {
        match = label.id;
        break;
      }
    }

    if (match || workspaceLevel) {
      labelIds.push((match || workspaceLevel) as string);
      continue;
    }

    try {
      const payload = await client.createIssueLabel({ name, teamId });
      const label = await payload.issueLabel;
      if (label) labelIds.push(label.id);
    } catch (err) {
      console.error(`Failed to create label "${name}":`, err);
      // 라벨 생성 실패해도 이슈 생성은 계속 진행
    }
  }

  return labelIds;
}
