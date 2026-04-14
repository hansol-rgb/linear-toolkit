export type {
  Issue,
  IssueSearchResult,
  IssueSearchPayload,
  IssuePayload,
  IssueConnection,
  IssueLabel,
  IssueLabelPayload,
  Team,
  TeamConnection,
  User,
  Comment,
  CommentPayload,
  WorkflowState,
  LinearFetch,
} from "@linear/sdk";

export interface CreateIssueParams {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  stateId?: string;          // 워크플로우 상태 ID
  priority?: number;         // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  estimate?: number;         // 포인트 estimate
  labelIds?: string[];
  assigneeId?: string;
  dueDate?: string;          // ISO 8601
}

export interface UpdateIssueParams {
  title?: string;
  description?: string;
  stateId?: string;
  priority?: number;
  assigneeId?: string;
  labelIds?: string[];
}
