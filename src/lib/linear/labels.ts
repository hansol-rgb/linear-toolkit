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
  const existing = await getLabels(teamId);

  const labelIds: string[] = [];

  for (const name of names) {
    const lowerName = name.toLowerCase();
    const found = existing.find(
      (l) => l.name.toLowerCase() === lowerName
    );

    if (found) {
      labelIds.push(found.id);
    } else {
      const payload = await client.createIssueLabel({
        name,
        teamId,
      });
      const label = await payload.issueLabel;
      if (label) {
        labelIds.push(label.id);
      }
    }
  }

  return labelIds;
}
