import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat API reads the knowledge/ Markdown files and data/ embeddings at runtime. This makes sure
  // Vercel copies them into the deployed server code.
  outputFileTracingIncludes: {
    // Also the saved embeddings (data/embeddings.bin and .json) for meaning-based search.
    "/api/chat": ["./knowledge/**/*.md", "./data/embeddings.*"],
  },
  // Hide the small "N" development badge so it doesn't cover the page in screenshots.
  // (It never appears in the deployed app.)
  devIndicators: false,
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
