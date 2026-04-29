import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("LINEAR_API_KEY is not set");
  process.exit(1);
}

const client = new LinearClient({ apiKey });

const identifier = process.argv[2];
if (!identifier) {
  console.error("Usage: tsx scripts/delete-issue.ts <IDENTIFIER>");
  process.exit(1);
}

async function main() {
  const results = await client.searchIssues(identifier, { includeArchived: true });
  const match = results.nodes.find((n) => n.identifier === identifier);
  if (!match) {
    console.error(`Not found: ${identifier}`);
    process.exit(1);
  }
  const res = await client.deleteIssue(match.id);
  if (res.success) {
    console.log(`✓ Deleted ${identifier} (${match.id})`);
  } else {
    console.log(`✗ Delete failed for ${identifier}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
