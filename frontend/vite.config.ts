import { writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function releaseIdentity(): Plugin {
  return {
    name: "cozinha360-release-identity",
    closeBundle() {
      const commit =
        process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || "local";
      const payload = {
        release: "5.6.0",
        commit,
        built_at: new Date().toISOString(),
        provider: process.env.RENDER
          ? "render"
          : process.env.GITHUB_ACTIONS
            ? "github-actions"
            : "local",
      };
      writeFileSync(
        "dist/release.json",
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), releaseIdentity()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
