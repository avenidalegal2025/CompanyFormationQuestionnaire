import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    "/api/agreement/generate": ["./templates/**/*"],
  },
  /* config options here */
};

export default nextConfig;
