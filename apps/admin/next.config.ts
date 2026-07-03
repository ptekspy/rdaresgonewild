import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@rdgw/database", "@rdgw/playbook", "@rdgw/crawler"],
  allowedDevOrigins: ["admin.paidpolitely.com"],
};

export default config;
