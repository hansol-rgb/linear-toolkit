import { readDoc } from "@/components/MarkdownDoc";
import { parseChangelog } from "@/lib/changelog/parse";
import { ChangelogTimeline } from "@/components/ChangelogTimeline";

export const dynamic = "force-static";

export default function ChangelogPage() {
  const { meta, body } = readDoc("docs/changelog.mdx");
  const entries = parseChangelog(body);
  return <ChangelogTimeline meta={meta} entries={entries} />;
}
