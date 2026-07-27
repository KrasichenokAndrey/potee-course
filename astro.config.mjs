import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// For GitHub Pages:
// 1. Replace githubUsername with your GitHub username.
// 2. GitHub Actions will read repoName from GITHUB_REPOSITORY automatically.
//    For a manual setup, replace the fallback "repo-name" with your repository name.
const githubUsername = "KrasichenokAndrey";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "repo-name";
const isGitHubActions = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  site: `https://${githubUsername}.github.io`,
  base: isGitHubActions ? `/${repoName}` : "/",
  integrations: [mdx()],
  trailingSlash: "always",
  build: {
    format: "directory"
  }
});
