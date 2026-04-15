import { sendDM } from "./dm";
import { chat, AI_MODEL_FAST } from "@/lib/ai/client";
import { getProjectListForPrompt, resolveProjectId } from "@/lib/linear/resolve";

// 프로젝트 선택 대기 중인 유저
const pendingProjectSelections = new Map<string, {
  teamId: string;
  callback: (projectId: string | undefined) => void;
}>();

/**
 * 프로젝트 매칭이 안 됐을 때 유저에게 DM으로 물어보기
 */
export async function askProjectSelection(
  userId: string,
  teamId: string,
  issueTitle: string,
): Promise<string | undefined> {
  const projectList = await getProjectListForPrompt(teamId);
  if (!projectList) return undefined;

  return new Promise<string | undefined>((resolve) => {
    pendingProjectSelections.set(userId, {
      teamId,
      callback: resolve,
    });

    // 5분 후 타임아웃
    setTimeout(() => {
      if (pendingProjectSelections.has(userId)) {
        pendingProjectSelections.delete(userId);
        resolve(undefined);
      }
    }, 300000);

    sendDM(
      userId,
      `*${issueTitle}*\n어떤 프로젝트에 넣을까요?\n\n등록된 프로젝트: ${projectList}\n\n프로젝트명을 말해주시거나, "없음"이라고 하시면 프로젝트 없이 생성합니다.`,
    );
  });
}

/**
 * 프로젝트 선택 대기 중인 유저의 응답 처리
 */
export async function handleProjectResponse(
  userId: string,
  text: string,
): Promise<boolean> {
  const pending = pendingProjectSelections.get(userId);
  if (!pending) return false;

  pendingProjectSelections.delete(userId);

  if (text.includes("없음") || text.includes("skip") || text.includes("건너")) {
    pending.callback(undefined);
    await sendDM(userId, "프로젝트 없이 생성합니다.");
    return true;
  }

  const projectId = await resolveProjectId(text.trim(), pending.teamId);
  if (projectId) {
    pending.callback(projectId);
    await sendDM(userId, `프로젝트에 연결했어요.`);
  } else {
    pending.callback(undefined);
    await sendDM(userId, `"${text}" 프로젝트를 찾을 수 없어서 프로젝트 없이 생성합니다.`);
  }

  return true;
}

export function hasPendingProjectSelection(userId: string): boolean {
  return pendingProjectSelections.has(userId);
}
