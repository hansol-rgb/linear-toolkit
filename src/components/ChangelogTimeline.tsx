"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocFrontmatter } from "./MarkdownDoc";
import type { ChangelogEntry } from "@/lib/changelog/parse";

type ShareStatus = "idle" | "loading" | "success" | "error";

interface Props {
  meta: DocFrontmatter;
  entries: ChangelogEntry[];
}

const PROSE_CLASSES =
  "prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:rounded prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none dark:prose-code:bg-neutral-800";

export function ChangelogTimeline({ meta, entries }: Props) {
  const [status, setStatus] = useState<Record<string, ShareStatus>>({});
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});

  async function handleShare(date: string) {
    setStatus((s) => ({ ...s, [date]: "loading" }));
    setErrorMsg((m) => ({ ...m, [date]: "" }));
    try {
      const res = await fetch("/api/changelog/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const text = await res.text();
        setErrorMsg((m) => ({ ...m, [date]: text }));
        setStatus((s) => ({ ...s, [date]: "error" }));
        return;
      }
      setStatus((s) => ({ ...s, [date]: "success" }));
      setTimeout(() => setStatus((s) => ({ ...s, [date]: "idle" })), 3000);
    } catch (err) {
      setErrorMsg((m) => ({ ...m, [date]: err instanceof Error ? err.message : String(err) }));
      setStatus((s) => ({ ...s, [date]: "error" }));
    }
  }

  function btnLabel(s: ShareStatus): string {
    switch (s) {
      case "loading": return "공유 중...";
      case "success": return "✓ 공유됨";
      case "error":   return "✗ 실패";
      default:        return "📤 슬랙에 공유";
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-6 py-12">
      <aside className="sticky top-24 hidden h-fit w-44 shrink-0 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          업데이트 날짜
        </div>
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.date}>
              <a
                href={`#date-${e.date}`}
                className="block rounded px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <span className="font-mono">{e.date}</span>
                {e.title && (
                  <div className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                    {e.title}
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex-1 min-w-0">
        {meta.lastUpdated && (
          <div className="mb-2 text-sm text-neutral-500">
            마지막 업데이트: {meta.lastUpdated}
          </div>
        )}
        <h1 className="mb-8 text-3xl font-bold">변경 내역</h1>

        {entries.map((e) => {
          const s = status[e.date] || "idle";
          return (
            <section
              key={e.date}
              id={`date-${e.date}`}
              className="mb-12 scroll-mt-24 border-b border-neutral-200 pb-10 last:border-b-0 dark:border-neutral-800"
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-2xl font-semibold">
                  {e.date}
                  {e.title && (
                    <span className="ml-3 font-sans text-base font-normal text-neutral-500">
                      — {e.title}
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => handleShare(e.date)}
                  disabled={s === "loading"}
                  className={
                    "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (s === "success"
                      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
                      : s === "error"
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800")
                  }
                >
                  {btnLabel(s)}
                </button>
              </div>
              {errorMsg[e.date] && (
                <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  {errorMsg[e.date]}
                </div>
              )}

              {e.features.length > 0 && (
                <div className="mb-6">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    기능 업데이트
                  </div>
                  <article className={PROSE_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {e.features.join("\n\n")}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
              {e.fixes.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    버그 픽스
                  </div>
                  <article className={PROSE_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {e.fixes.join("\n\n")}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
