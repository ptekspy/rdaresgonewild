import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@rdgw/database", "@rdgw/playbook", "@rdgw/crawler"],
};

export default config;
