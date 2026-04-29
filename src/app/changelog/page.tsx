import { MarkdownDoc, readDoc } from "@/components/MarkdownDoc";

export const dynamic = "force-static";

export default function ChangelogPage() {
  const { meta, body } = readDoc("docs/changelog.mdx");
  return <MarkdownDoc meta={meta} body={body} />;
}
