import { sendDM } from "./dm";
import { getIssueByIdentifier, updateIssue, addComment, getMyIssues } from "@/lib/linear/issues";
import { searchIssues } from "@/lib/linear/search";
import { resolveLinearUserId } from "@/lib/linear/resolve";
import type { ParsedIntent } from "@/lib/ai/intent";

export async function executeCommand(userId: string, intent: ParsedIntent): Promise<void> {
  switch (intent.action) {
    case "complete":
      await handleComplete(userId, intent);
      break;
    case "update_status":
      await handleUpdateStatus(userId, intent);
      break;
    case "assign":
      await handleAssign(userId, intent);
      break;
    case "search":
      await handleSearch(userId, intent);
      break;
    case "info":
      await handleInfo(userId, intent);
      break;
    case "comment":
      await handleComment(userId, intent);
      break;
    case "update_due_date":
      await handleUpdateDueDate(userId, intent);
      break;
    case "update_priority":
      await handleUpdatePriority(userId, intent);
      break;
    default:
      await sendDM(userId, "무슨 말인지 잘 모르겠어요. 다시 말해주세요.");
  }
}

async function handleComplete(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier) {
    await sendDM(userId, "어떤 이슈를 완료 처리할까요? 이슈 번호를 알려주세요. (예: PROJ-42)");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  // Find "Done" state
  const team = await issue.team;
  if (!team) {
    await sendDM(userId, "이슈의 팀 정보를 찾을 수 없어요.");
    return;
  }
  const states = await team.states();
  const doneState = states.nodes.find((s) => s.name.toLowerCase() === "done");

  if (!doneState) {
    await sendDM(userId, "Done 상태를 찾을 수 없어요.");
    return;
  }

  await updateIssue(issue.id, { stateId: doneState.id });
  await sendDM(userId, `*${intent.issueIdentifier}* 완료 처리했어요.`);
}

async function handleUpdateStatus(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier || !intent.targetState) {
    await sendDM(userId, "이슈 번호와 변경할 상태를 알려주세요. (예: PROJ-42 진행중으로 바꿔줘)");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  const team = await issue.team;
  if (!team) {
    await sendDM(userId, "이슈의 팀 정보를 찾을 수 없어요.");
    return;
  }
  const states = await team.states();

  // 한국어/영어 상태 매칭
  const stateMap: Record<string, string[]> = {
    "backlog": ["backlog", "백로그"],
    "todo": ["todo", "할일", "할 일"],
    "in progress": ["in progress", "진행중", "진행 중"],
    "in review": ["in review", "리뷰중", "리뷰 중", "검토중"],
    "done": ["done", "완료", "끝"],
  };

  const targetLower = intent.targetState.toLowerCase();
  let matchedState = states.nodes.find((s) => s.name.toLowerCase() === targetLower);

  if (!matchedState) {
    for (const [stateName, aliases] of Object.entries(stateMap)) {
      if (aliases.some((a) => targetLower.includes(a))) {
        matchedState = states.nodes.find((s) => s.name.toLowerCase() === stateName);
        break;
      }
    }
  }

  if (!matchedState) {
    const available = states.nodes.map((s) => s.name).join(", ");
    await sendDM(userId, `"${intent.targetState}" 상태를 찾을 수 없어요. 사용 가능한 상태: ${available}`);
    return;
  }

  await updateIssue(issue.id, { stateId: matchedState.id });
  await sendDM(userId, `*${intent.issueIdentifier}* → *${matchedState.name}* 으로 변경했어요.`);
}

async function handleAssign(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier) {
    await sendDM(userId, "어떤 이슈를 할당할까요? 이슈 번호를 알려주세요.");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  // 자기 자신에게 할당하는 경우
  if (!intent.targetUser || intent.targetUser === "나" || intent.targetUser === "me") {
    const myLinearId = await resolveLinearUserId(userId);
    if (myLinearId) {
      await updateIssue(issue.id, { assigneeId: myLinearId });
      await sendDM(userId, `*${intent.issueIdentifier}* 을 본인에게 할당했어요.`);
    } else {
      await sendDM(userId, "Linear 계정을 찾을 수 없어요.");
    }
    return;
  }

  await sendDM(userId, `*${intent.issueIdentifier}* 에 ${intent.targetUser}님을 할당하려면 Linear에서 직접 변경해주세요. (아직 이름 기반 할당은 지원하지 않아요)`);
}

async function handleSearch(userId: string, intent: ParsedIntent): Promise<void> {
  if (intent.rawQuery) {
    const results = await searchIssues(intent.rawQuery);
    if (results.length === 0) {
      await sendDM(userId, `"${intent.rawQuery}" 관련 이슈를 찾을 수 없어요.`);
      return;
    }
    const list = results.slice(0, 5).map((r) => `• *${r.identifier}*: ${r.title}`).join("\n");
    await sendDM(userId, `검색 결과:\n${list}`);
    return;
  }

  // "내 이슈 보여줘"
  const myLinearId = await resolveLinearUserId(userId);
  if (!myLinearId) {
    await sendDM(userId, "Linear 계정을 찾을 수 없어요.");
    return;
  }

  const myIssues = await getMyIssues(myLinearId);
  if (myIssues.length === 0) {
    await sendDM(userId, "할당된 이슈가 없어요.");
    return;
  }

  const list = await Promise.all(
    myIssues.slice(0, 10).map(async (issue) => {
      const state = await issue.state;
      return `• *${issue.identifier}*: ${issue.title} [${state?.name || ""}]`;
    })
  );
  await sendDM(userId, `내 이슈:\n${list.join("\n")}`);
}

async function handleInfo(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier) {
    await sendDM(userId, "어떤 이슈를 확인할까요? 이슈 번호를 알려주세요.");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  const state = await issue.state;
  const assignee = await issue.assignee;
  const project = await issue.project;

  const info = [
    `*${issue.identifier}*: ${issue.title}`,
    `상태: ${state?.name || "없음"}`,
    `담당자: ${assignee?.name || "없음"}`,
    `우선순위: P${issue.priority}`,
    `프로젝트: ${project?.name || "없음"}`,
    issue.dueDate ? `마감일: ${issue.dueDate}` : null,
  ].filter(Boolean).join("\n");

  await sendDM(userId, info);
}

async function handleComment(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier || !intent.rawQuery) {
    await sendDM(userId, "이슈 번호와 코멘트 내용을 알려주세요. (예: PROJ-42에 코멘트 달아줘: 내용)");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  await addComment(issue.id, intent.rawQuery);
  await sendDM(userId, `*${intent.issueIdentifier}* 에 코멘트를 추가했어요.`);
}

async function handleUpdateDueDate(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier || !intent.rawQuery) {
    await sendDM(userId, "이슈 번호와 마감일을 알려주세요. (예: PROJ-42 마감일 금요일로 바꿔줘)");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  // 자연어 날짜 파싱
  const now = new Date();
  const dayMap: Record<string, number> = {
    "월요일": 1, "화요일": 2, "수요일": 3, "목요일": 4, "금요일": 5,
    "토요일": 6, "일요일": 0,
  };

  let dueDate: string | null = null;
  const query = intent.rawQuery.toLowerCase();

  if (query.includes("오늘")) {
    dueDate = now.toISOString().slice(0, 10);
  } else if (query.includes("내일")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = tomorrow.toISOString().slice(0, 10);
  } else if (query.includes("다음 주") || query.includes("다음주")) {
    const nextFriday = new Date(now);
    nextFriday.setDate(nextFriday.getDate() + (12 - nextFriday.getDay()) % 7);
    dueDate = nextFriday.toISOString().slice(0, 10);
  } else {
    for (const [dayName, dayNum] of Object.entries(dayMap)) {
      if (query.includes(dayName)) {
        const target = new Date(now);
        const diff = (dayNum - now.getDay() + 7) % 7 || 7;
        target.setDate(target.getDate() + diff);
        dueDate = target.toISOString().slice(0, 10);
        break;
      }
    }
  }

  // YYYY-MM-DD 형식 직접 입력
  if (!dueDate) {
    const dateMatch = intent.rawQuery.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      dueDate = dateMatch[1];
    }
  }

  if (!dueDate) {
    await sendDM(userId, `"${intent.rawQuery}" 날짜를 이해하지 못했어요. "금요일", "내일", "2026-04-20" 형식으로 말해주세요.`);
    return;
  }

  await updateIssue(issue.id, { dueDate });
  await sendDM(userId, `*${intent.issueIdentifier}* 마감일을 *${dueDate}* 로 변경했어요.`);
}

async function handleUpdatePriority(userId: string, intent: ParsedIntent): Promise<void> {
  if (!intent.issueIdentifier || !intent.rawQuery) {
    await sendDM(userId, "이슈 번호와 우선순위를 알려주세요. (예: PROJ-42 우선순위 긴급으로)");
    return;
  }

  const issue = await getIssueByIdentifier(intent.issueIdentifier);
  if (!issue) {
    await sendDM(userId, `${intent.issueIdentifier} 이슈를 찾을 수 없어요.`);
    return;
  }

  const priorityMap: Record<string, number> = {
    "긴급": 1, "urgent": 1,
    "높음": 2, "high": 2,
    "보통": 3, "medium": 3,
    "낮음": 4, "low": 4,
    "없음": 0, "none": 0,
  };

  const query = intent.rawQuery.toLowerCase();
  let priority: number | undefined;

  for (const [name, value] of Object.entries(priorityMap)) {
    if (query.includes(name)) {
      priority = value;
      break;
    }
  }

  if (priority === undefined) {
    await sendDM(userId, `"${intent.rawQuery}" 우선순위를 이해하지 못했어요. 긴급/높음/보통/낮음 중 선택해주세요.`);
    return;
  }

  await updateIssue(issue.id, { priority });
  const priorityNames = ["없음", "긴급", "높음", "보통", "낮음"];
  await sendDM(userId, `*${intent.issueIdentifier}* 우선순위를 *${priorityNames[priority]}* 으로 변경했어요.`);
}
