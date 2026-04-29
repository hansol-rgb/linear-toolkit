import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/changelog/share가 런타임에 docs/changelog.mdx를 fs로 읽음 → trace에 명시적 포함
  outputFileTracingIncludes: {
    "/api/changelog/share": ["./docs/**/*"],
  },
};

export default nextConfig;
