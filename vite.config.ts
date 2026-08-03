import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

function normalizeBasePath(raw?: string): string {
  const value = (raw || "").trim();
  if (!value) return "/";
  // "./" is passed through so the build can be dropped into any
  // sub-directory without knowing its path up front. Forcing a leading
  // slash would rewrite it to "/./" and emit absolute asset URLs,
  // which 404 anywhere but a domain root.
  // (Note: this still needs an HTTP server — browsers block ES modules
  // loaded over file:// on CORS grounds, whatever the base path is.)
  if (value === "./" || value === ".") return "./";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function localQuestionBankPlugin(): Plugin {
  const questionBankPath = path.resolve(import.meta.dirname, "..", "question_bank_infinitycloser.json");
  return {
    name: "local-question-bank",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/question-bank", (_req, res) => {
        if (!fs.existsSync(questionBankPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "question_bank_infinitycloser.json not found" }));
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        fs.createReadStream(questionBankPath).pipe(res);
      });
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), localQuestionBankPlugin()];
const base = normalizeBasePath(process.env.VITE_BASE_PATH);

export default defineConfig({
  base,
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
