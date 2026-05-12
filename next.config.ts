import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // oracledb has native bindings (.node) and a Thick-mode runtime that depends
  // on Oracle Instant Client. Webpack bundling breaks both — mark it external
  // so it's required at runtime from node_modules with paths intact.
  serverExternalPackages: ["oracledb"],
};

export default nextConfig;
