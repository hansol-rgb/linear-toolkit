import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface DocFrontmatter {
  title?: string;
  description?: string;
  lastUpdated?: string;
}

export function readDoc(relativePath: string): { meta: DocFrontmatter; body: string } {
  const filePath = path.join(process.cwd(), relativePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta: DocFrontmatter = {};
  let body = raw;
  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.substring(0, idx).trim() as keyof DocFrontmatter;
      meta[key] = line.substring(idx + 1).trim();
    }
    body = raw.substring(fmMatch[0].length);
  }
  return { meta, body: body.trim() };
}

export function MarkdownDoc({ meta, body }: { meta: DocFrontmatter; body: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {meta.lastUpdated && (
        <div className="mb-2 text-sm text-neutral-500">
          마지막 업데이트: {meta.lastUpdated}
        </div>
      )}
      <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:rounded prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-neutral-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </article>
    </div>
  );
}
