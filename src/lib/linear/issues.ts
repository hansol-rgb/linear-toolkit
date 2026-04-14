import type { Issue } from "@linear/sdk";
import { getLinearClient } from "./client";
import type { CreateIssueParams, UpdateIssueParams } from "./types";

export async function createIssue(params: CreateIssueParams): Promise<Issue> {
  const client = getLinearClient();
  const payload = await client.createIssue({
    title: params.title,
    description: params.description,
    teamId: params.teamId,
    projectId: params.projectId,
    stateId: params.stateId,
    priority: params.priority,
    estimate: params.estimate,
    labelIds: params.labelIds,
    assigneeId: params.assigneeId,
    dueDate: params.dueDate,
  });

  const issue = await payload.issue;
  if (!issue) {
    throw new Error("Failed to create issue");
  }
  return issue;
}

export async function updateIssue(
  issueId: string,
  params: UpdateIssueParams
): Promise<Issue> {
  const client = getLinearClient();
  const payload = await client.updateIssue(issueId, {
    title: params.title,
    description: params.description,
    stateId: params.stateId,
    priority: params.priority,
    assigneeId: params.assigneeId,
    labelIds: params.labelIds,
  });

  const issue = await payload.issue;
  if (!issue) {
    throw new Error("Failed to update issue");
  }
  return issue;
}

export async function addComment(
  issueId: string,
  body: string
): Promise<void> {
  const client = getLinearClient();
  await client.createComment({ issueId, body });
}

export async function getMyIssues(userId?: string): Promise<Issue[]> {
  const client = getLinearClient();

  const user = userId
    ? await client.user(userId)
    : await client.viewer;

  const assignedIssues = await user.assignedIssues();
  return assignedIssues.nodes;
}

export async function getIssueByIdentifier(
  identifier: string
): Promise<Issue | null> {
  const client = getLinearClient();

  const results = await client.searchIssues(identifier, {
    includeArchived: false,
  });

  // searchIssues returns fuzzy results — match the exact identifier
  const match = results.nodes.find(
    (node) => node.identifier === identifier
  );
  if (!match) return null;

  return client.issue(match.id);
}
