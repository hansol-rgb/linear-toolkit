import type { IssueSearchResult } from "@linear/sdk";
import { getLinearClient } from "./client";

export async function searchIssues(
  query: string,
  teamId?: string
): Promise<IssueSearchResult[]> {
  const client = getLinearClient();

  const results = await client.searchIssues(query, {
    ...(teamId && {
      filter: { team: { id: { eq: teamId } } },
    }),
  });

  return results.nodes;
}

export async function findSimilarIssues(
  title: string,
  teamId?: string
): Promise<IssueSearchResult[]> {
  const client = getLinearClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const results = await client.searchIssues(title, {
    filter: {
      createdAt: { gte: thirtyDaysAgo },
      ...(teamId && { team: { id: { eq: teamId } } }),
    },
  });

  return results.nodes;
}
