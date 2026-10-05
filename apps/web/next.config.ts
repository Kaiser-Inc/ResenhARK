import path from "node:path";
import type { NextConfig } from "next";

const sharedSrcDir = path.join(import.meta.dirname, "../../packages/shared/src");

const nextConfig: NextConfig = {
  transpilePackages: ["@resenhark/shared"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  webpack(config) {
    // `transpilePackages` is supposed to teach webpack that a bare `.js`
    // specifier inside a transpiled package may resolve to `.ts`/`.tsx` —
    // that stops covering it once the package has enough internal relative
    // imports (barrel file → multiple submodules), so it's set explicitly.
    // Scoped to packages/shared/src via a per-rule `resolve` override
    // (Webpack 5) rather than the global `config.resolve.extensionAlias`,
    // to keep it from touching Next's own internal module resolution.
    config.module.rules.push({
      test: /\.[jt]sx?$/,
      include: sharedSrcDir,
      resolve: {
        extensionAlias: {
          ".js": [".ts", ".tsx", ".js"],
        },
      },
    });
    return config;
  },
};

export default nextConfig;
