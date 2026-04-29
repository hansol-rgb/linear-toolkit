import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("LINEAR_API_KEY is not set");
  process.exit(1);
}

const client = new LinearClient({ apiKey });

const toDelete: Array<{ id: string; name: string; team: string }> = [
  // 프로젝트팀
  { id: "7d7ebcb1-d9f2-47ba-b8c9-c8b8aa9ea3ad", name: "Adobe KR", team: "PROJ" },
  { id: "074eb1a7-ec2f-4a3c-9410-0ccee5b107fd", name: "YouTube", team: "PROJ" },
  { id: "15a86b68-a117-4fb2-b09c-fde42182423a", name: "클라이언트 커뮤니케이션", team: "PROJ" },
  { id: "923c798f-1cd9-4f5f-bdc2-6d652517b327", name: "클라이언트요청", team: "PROJ" },
  { id: "c28e096c-1095-45d9-874b-be53d7927661", name: "캠페인", team: "PROJ" },
  { id: "402bfecf-2ce9-43a8-8c18-27f875daa5f2", name: "킥오프", team: "PROJ" },
  { id: "6ec28288-d68b-4225-9cbe-e8448e5d0d41", name: "진행중", team: "PROJ" },
  { id: "05e2b6f9-3700-4f85-8d31-ba0abdb5afb1", name: "피드백대기", team: "PROJ" },
  { id: "6166af2a-c1f2-4641-9149-c3c468004ff4", name: "납품", team: "PROJ" },
  { id: "6a3b8169-0284-4c85-882d-96d3a0a992b8", name: "마감", team: "PROJ" },
  { id: "70553c46-b7af-4876-b0cf-8efdf6373c01", name: "내부작업", team: "PROJ" },
  { id: "9459ad81-55c9-48ed-ab83-0c5c8d279661", name: "내부 운영", team: "PROJ" },
  { id: "ed572a8c-f12e-4bb8-83b3-23d7e6d87df4", name: "prompt-engineering", team: "PROJ" },
  { id: "1c63ab0e-cf36-405f-ba34-55ee3c1c730f", name: "automation", team: "PROJ" },
  { id: "befcb697-9db5-472c-86fc-434ef51b3060", name: "testing", team: "PROJ" },
  { id: "6b04af0b-7763-4990-987c-fadccaa2f31b", name: "documentation", team: "PROJ" },
  { id: "a82a6f65-7bb5-4262-a4cd-f996432806df", name: "docs", team: "PROJ" },
  { id: "499fea7d-33a3-49d6-9093-806cbb87d60e", name: "chore", team: "PROJ" },
  { id: "0fdbec4b-aa4c-4441-9029-9a92a6728a0e", name: "도구 도입", team: "PROJ" },
  // 프로덕트팀
  { id: "cfc12066-2385-401d-beeb-9b3a42577ada", name: "chore", team: "PRD" },
  { id: "3720bfd8-bf11-4df1-bb0f-bbf9d3c89acb", name: "docs", team: "PRD" },
  { id: "0932abe3-5277-4b61-a4f0-9d3c12783e61", name: "urgent", team: "PRD" },
  { id: "c312deae-1959-4b3a-8ea8-d84e2ef031ed", name: "blocked", team: "PRD" },
  { id: "37c44c1f-c82f-41ca-af54-a15524e09582", name: "랜딩페이지", team: "PRD" },
  { id: "75dd0a66-f124-433a-ba62-f3aace760f57", name: "CTA", team: "PRD" },
  { id: "aeb81080-cfbc-46de-90ba-05cc432a8304", name: "폼", team: "PRD" },
  { id: "8b02d6f8-e188-4652-b23c-04f32d829563", name: "카피", team: "PRD" },
  { id: "77f11d91-d2aa-4cbd-aeb9-b82d01c7043b", name: "UX", team: "PRD" },
];

async function main() {
  let ok = 0;
  let failed = 0;
  for (const label of toDelete) {
    try {
      const res = await client.deleteIssueLabel(label.id);
      if (res.success) {
        console.log(`✓ [${label.team}] ${label.name}`);
        ok++;
      } else {
        console.log(`✗ [${label.team}] ${label.name} — success=false`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ [${label.team}] ${label.name} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  console.log(`\nDone: ${ok} deleted, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
