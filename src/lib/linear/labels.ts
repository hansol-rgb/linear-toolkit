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
    // 워크스페이스 + 팀 레벨 라벨 모두 검색 (같은 이름이 워크스페이스에 있으면 팀 생성 실패함)
    const found = await client.issueLabels({
      filter: { name: { eqIgnoreCase: name } },
    });

    const match = found.nodes[0];
    if (match) {
      labelIds.push(match.id);
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
