import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the indicator sits on top of the map's bottom-left controls; errors still surface without it
  devIndicators: false,
  partialPrefetching: true,
  // the MySQL driver loads parts of itself at runtime; leave it to Node instead of bundling it
  serverExternalPackages: ["mysql2"],
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
