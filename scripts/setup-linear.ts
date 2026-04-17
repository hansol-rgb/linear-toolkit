/**
 * Linear 워크스페이스 일괄 세팅 스크립트.
 *
 * 실행: `npm run setup:linear`
 *
 * 수행 작업:
 *  - 팀별: Workflow states(In Review, Blocked) + Estimation(Fibonacci) + Issue Views 5개
 *  - 워크스페이스: Issue Views 2개(내 오늘/이번주 전체) + Project Views 4개
 *
 * 멱등성: 이름 기반으로 이미 존재하면 스킵함.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("LINEAR_API_KEY not found in .env.local");
  process.exit(1);
}

const client = new LinearClient({ apiKey });

type WorkflowStateType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";

async function ensureState(
  teamId: string,
  name: string,
  type: WorkflowStateType,
  color: string,
): Promise<void> {
  const team = await client.team(teamId);
  const states = await team.states();
  const existing = states.nodes.find((s) => s.name === name);
  if (existing) {
    console.log(`  · State "${name}" already exists, skip`);
    return;
  }
  await client.createWorkflowState({ teamId, name, type, color });
  console.log(`  ✓ Created state "${name}" (${type}, ${color})`);
}

async function enableEstimation(teamId: string): Promise<void> {
  const team = await client.team(teamId);
  const current = team.issueEstimationType;
  if (current && current !== "notUsed") {
    console.log(`  · Estimation already enabled: "${current}", skip`);
    return;
  }
  await client.updateTeam(teamId, {
    issueEstimationType: "fibonacci",
    issueEstimationAllowZero: true,
  });
  console.log(`  ✓ Enabled fibonacci estimation (0, 1, 2, 3, 5, 8)`);
}

interface ViewSpec {
  name: string;
  description: string;
  filterData: Record<string, unknown>;
}

async function ensureView(teamId: string, spec: ViewSpec, teamKey: string): Promise<void> {
  // 같은 팀 소속 + 같은 이름 뷰가 이미 있으면 스킵
  const views = await client.customViews();
  for (const v of views.nodes) {
    if (v.name !== spec.name) continue;
    const vTeam = await v.team;
    if (vTeam?.id === teamId) {
      console.log(`  · View "${spec.name}" already exists in ${teamKey}, skip`);
      return;
    }
  }

  await client.createCustomView({
    teamId,
    name: spec.name,
    description: spec.description,
    filterData: spec.filterData,
    shared: true,
  });
  console.log(`  ✓ Created view "${spec.name}" in ${teamKey}`);
}

async function ensureWorkspaceView(spec: ViewSpec): Promise<void> {
  // teamId=null 인 워크스페이스 뷰 중 같은 이름 있으면 스킵
  const views = await client.customViews();
  for (const v of views.nodes) {
    if (v.name !== spec.name) continue;
    const vTeam = await v.team;
    if (!vTeam) {
      console.log(`  · Workspace view "${spec.name}" already exists, skip`);
      return;
    }
  }

  await client.createCustomView({
    name: spec.name,
    description: spec.description,
    filterData: spec.filterData,
    shared: true,
  });
  console.log(`  ✓ Created workspace view "${spec.name}"`);
}

async function setupTeam(team: { id: string; name: string; key: string }): Promise<void> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Target: ${team.name} (${team.key}) — id=${team.id}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 1. Workflow states
  console.log("[1/3] Workflow states 추가");
  await ensureState(team.id, "In Review", "started", "#9B59B6");
  await ensureState(team.id, "Blocked", "started", "#E74C3C");
  console.log();

  // 2. Estimation
  console.log("[2/3] Estimation 활성화");
  await enableEstimation(team.id);
  console.log();

  // 3. Custom views
  console.log("[3/3] Custom Views 생성");

  const notDoneStateTypes = ["backlog", "unstarted", "started"];

  const views: ViewSpec[] = [
    {
      name: "🔥 내 오늘",
      description: "본인 담당 이슈 중 진행 중이거나 오늘 마감인 것",
      filterData: {
        and: [
          { assignee: { isMe: { eq: true } } },
          {
            or: [
              { state: { type: { eq: "started" } } },
              { dueDate: { eq: "P0D" } },
            ],
          },
        ],
      },
    },
    {
      name: "📅 내 이번주",
      description: "본인 담당 이슈 중 이번주 금요일까지 마감, 완료 아닌 것",
      filterData: {
        and: [
          { assignee: { isMe: { eq: true } } },
          { dueDate: { lte: "P5D" } },
          { state: { type: { in: notDoneStateTypes } } },
        ],
      },
    },
    {
      name: "⚠️ 팀 기한 넘김",
      description: "마감일이 지났는데 완료 안 된 팀 전체 이슈",
      filterData: {
        and: [
          { dueDate: { lt: "P0D" } },
          { state: { type: { in: notDoneStateTypes } } },
        ],
      },
    },
    {
      name: "🚧 팀 블로킹",
      description: "Blocked 상태인 팀 전체 이슈",
      filterData: {
        state: { name: { eq: "Blocked" } },
      },
    },
    {
      name: "🎯 팀 진행중 (프로젝트별 보기)",
      description: "완료 안 된 팀 전체 이슈 — 열람 후 Group by Project 로 보기",
      filterData: {
        state: { type: { in: notDoneStateTypes } },
      },
    },
  ];

  for (const view of views) {
    try {
      await ensureView(team.id, view, team.key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ View "${view.name}" 생성 실패: ${msg}`);
    }
  }
}

async function setupWorkspaceViews(): Promise<void> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Workspace-level Views`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const notDoneStateTypes = ["backlog", "unstarted", "started"];

  const issueViews: ViewSpec[] = [
    {
      name: "🔥 내 오늘 (전체)",
      description: "양 팀 통합 — 본인 담당 이슈 중 진행 중이거나 오늘 마감",
      filterData: {
        and: [
          { assignee: { isMe: { eq: true } } },
          {
            or: [
              { state: { type: { eq: "started" } } },
              { dueDate: { eq: "P0D" } },
            ],
          },
        ],
      },
    },
    {
      name: "📅 내 이번주 (전체)",
      description: "양 팀 통합 — 본인 담당 이슈 중 이번주 금요일까지 마감",
      filterData: {
        and: [
          { assignee: { isMe: { eq: true } } },
          { dueDate: { lte: "P5D" } },
          { state: { type: { in: notDoneStateTypes } } },
        ],
      },
    },
  ];

  console.log("Issue views (전체 워크스페이스):");
  for (const view of issueViews) {
    try {
      await ensureWorkspaceView(view);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ "${view.name}" 실패: ${msg}`);
    }
  }
}

function printProjectViewGuide(): void {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Project-level Views 수동 세팅 가이드`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`
Linear API는 Project views 생성을 지원하지 않아요. Linear 앱에서 수동으로 만드세요.

**경로**: Linear 앱 → 사이드바 Views → + 새 View → Display에서 "Projects" 선택

**1. 👥 담당자별 프로젝트**
  - Filter: Status = "In Progress" OR "Planned" OR "Backlog"
  - Group by: Lead
  - Share: Workspace

**2. 🚀 출시 예정 (3개월 내)**
  - Filter: Target date ≤ +3 months AND Status ≠ Completed/Canceled
  - Sort by: Target date (ascending)
  - Group by: Target quarter (optional)
  - Share: Workspace

**3. 🌐 이니셔티브별 프로젝트**
  - Filter: Initiative is set
  - Group by: Initiative
  - Share: Workspace

**4. 📊 이번 분기 (완료 + 예정)**
  - Filter: (Status = Completed AND Completed this quarter) OR (Target date this quarter)
  - Group by: Status
  - Share: Workspace
`);
}

async function main(): Promise<void> {
  console.log("=== Linear 자동 세팅 시작 ===");

  const teams = await client.teams();
  if (teams.nodes.length === 0) {
    console.error("No Linear teams found");
    process.exit(1);
  }
  console.log(`총 ${teams.nodes.length}개 팀 발견: ${teams.nodes.map((t) => t.key).join(", ")}`);

  for (const team of teams.nodes) {
    await setupTeam(team);
  }

  await setupWorkspaceViews();
  printProjectViewGuide();

  console.log("\n=== 전체 완료 ===");
  console.log("Linear 사이드바 → Views 탭에서 확인하세요.");
}

main().catch((err) => {
  console.error("\n❌ 세팅 실패:", err);
  process.exit(1);
});
