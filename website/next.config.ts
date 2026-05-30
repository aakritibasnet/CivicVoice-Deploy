import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory. Without it, Next.js infers the
  // monorepo root (D:\projects\CivicVoice) because of a stray package-lock.json
  // there, and Turbopack then tries to walk the entire tree (backend
  // node_modules, mobile, generated Prisma clients) and panics with
  // "failed to create whole tree".
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["app/generated/prisma"],
};

export default nextConfig;
