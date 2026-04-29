import { MarkdownDoc, readDoc } from "@/components/MarkdownDoc";

export const dynamic = "force-static";

export default function GuidePage() {
  const { meta, body } = readDoc("docs/user-guide.md");
  return <MarkdownDoc meta={meta} body={body} />;
}
