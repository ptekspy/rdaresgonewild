import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const appRootDirs = ["apps/admin", "apps/adserver", "apps/web"];

export default [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      "**/.next/**",
      "**/.open-next/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "node_modules/**",
    ],
  },
  {
    settings: {
      next: {
        rootDir: appRootDirs,
      },
    },
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
