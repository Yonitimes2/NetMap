import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the indicator sits on top of the map's bottom-left controls; errors still surface without it
  devIndicators: false,
  partialPrefetching: true,
  // the MySQL driver and the image library (sharp) load parts of themselves at runtime; leave them to Node
  serverExternalPackages: ["mysql2", "sharp"],
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
