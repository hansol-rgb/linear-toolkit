/**
 * 한 방 배포: changelog 자동 갱신 → 자동 커밋 → vercel deploy --prod
 *
 * 사용:
 *   npm run deploy             # 풀 배포
 *   npm run deploy -- --dry-run # changelog만 dry-run, 커밋/배포 안 함
 *
 * 워크플로우:
 *   1) 작업 디렉토리 클린한지 확인 (커밋 안 한 코드가 있으면 중단)
 *   2) `npm run changelog` 실행 — mdx + state 파일 갱신
 *   3) 갱신된 mdx + state를 자동 커밋 ("chore(changelog): auto-update")
 *   4) `vercel deploy --prod` 실행
 */
import { execSync } from "child_process";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

const CHANGELOG_FILES = [
  "docs/changelog.mdx",
  "scripts/.changelog-state.json",
];

function run(cmd: string, label: string): void {
  console.log(`\n──── ${label} ────`);
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function gitStatus(paths?: string[]): string {
  const args = paths?.length ? ` -- ${paths.join(" ")}` : "";
  return execSync(`git status --porcelain${args}`, { encoding: "utf-8" }).trim();
}

function main() {
  // 1. 클린 작업 디렉토리 검증 (changelog 파일 외 변경이 있으면 중단)
  const dirty = gitStatus();
  if (dirty) {
    const lines = dirty.split("\n");
    const nonChangelog = lines.filter((l) => {
      const file = l.substring(3);
      return !CHANGELOG_FILES.some((f) => file.startsWith(f));
    });
    if (nonChangelog.length > 0) {
      console.error("\n❌ 커밋되지 않은 변경사항이 있습니다:\n");
      console.error(nonChangelog.map((l) => `   ${l}`).join("\n"));
      console.error("\n코드 변경은 먼저 커밋한 뒤 배포하세요. 배포 자체는 changelog 파일만 자동 커밋합니다.\n");
      process.exit(1);
    }
  }

  // 2. changelog 갱신
  run(
    DRY_RUN ? "npm run changelog -- --dry-run" : "npm run changelog",
    "1/3 changelog 생성",
  );

  if (DRY_RUN) {
    console.log("\n[dry-run] 커밋/배포 없이 종료");
    return;
  }

  // 3. changelog 변경사항 있으면 자동 커밋
  const changelogDirty = gitStatus(CHANGELOG_FILES);
  if (changelogDirty) {
    run(`git add ${CHANGELOG_FILES.join(" ")}`, "2/3 changelog 스테이징");
    run(`git commit -m "chore(changelog): auto-update"`, "    └ 자동 커밋");
  } else {
    console.log("\n──── 2/3 changelog 커밋 ────");
    console.log("새 항목 없음 — 커밋 스킵");
  }

  // 4. Vercel 배포
  run("vercel deploy --prod", "3/3 Vercel 배포");

  console.log("\n✅ 배포 완료");
  console.log("   Changelog: https://linear-toolkit.vercel.app/changelog");
}

main();
