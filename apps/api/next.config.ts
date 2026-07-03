import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rdgw/database", "@rdgw/playbook", "@rdgw/crawler"],
};

export default nextConfig;
