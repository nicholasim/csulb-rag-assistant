import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat API reads the knowledge/ Markdown files at runtime. This makes sure
  // Vercel copies them into the deployed server code.
  outputFileTracingIncludes: {
    "/api/chat": ["./knowledge/**/*.md"],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
