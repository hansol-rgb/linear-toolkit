import { MarkdownDoc, readDoc } from "@/components/MarkdownDoc";

export const dynamic = "force-static";

export default function SystemPage() {
  const { meta, body } = readDoc("docs/system.md");
  return <MarkdownDoc meta={meta} body={body} />;
}
