import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

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

/**
 * Dev stand-in for the Vercel function in `api/question-bank.ts`.
 *
 * It speaks the same three verbs against a file on disk, so the
 * publish flow can be exercised end to end locally instead of only
 * against a deployment. Published content lands in
 * `.local-question-bank.json` (git-ignored); when nothing has been
 * published it falls back to the repo's own bank file, which is what
 * the old middleware did.
 */
function localQuestionBankPlugin(adminToken: string): Plugin {
  const sourcePath = path.resolve(import.meta.dirname, "..", "question_bank_infinitycloser.json");
  const publishedPath = path.resolve(import.meta.dirname, ".local-question-bank.json");

  const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  const authorized = (req: import("node:http").IncomingMessage) => {
    if (!adminToken) return false;
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") && header.slice(7) === adminToken;
  };

  const readBody = (req: import("node:http").IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let raw = "";
      req.on("data", chunk => { raw += chunk; });
      req.on("end", () => resolve(raw));
      req.on("error", reject);
    });

  return {
    name: "local-question-bank",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/question-bank", async (req, res) => {
        if (req.method === "GET") {
          const file = fs.existsSync(publishedPath)
            ? publishedPath
            : fs.existsSync(sourcePath)
              ? sourcePath
              : null;
          if (!file) {
            json(res, 404, { error: "no published bank" });
            return;
          }
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          fs.createReadStream(file).pipe(res);
          return;
        }

        if (req.method === "PUT" || req.method === "POST") {
          if (!authorized(req)) {
            json(res, 401, {
              error: adminToken
                ? "טוקן ניהול שגוי"
                : "ADMIN_UPLOAD_TOKEN לא מוגדר ב-.env.local",
            });
            return;
          }
          try {
            const parsed = JSON.parse(await readBody(req));
            fs.writeFileSync(publishedPath, JSON.stringify(parsed, null, 2), "utf8");
            json(res, 200, { ok: true, publishedAt: new Date().toISOString() });
          } catch {
            json(res, 400, { error: "JSON לא תקין" });
          }
          return;
        }

        if (req.method === "DELETE") {
          if (!authorized(req)) {
            json(res, 401, { error: "טוקן ניהול שגוי או חסר" });
            return;
          }
          if (fs.existsSync(publishedPath)) fs.unlinkSync(publishedPath);
          json(res, 200, { ok: true });
          return;
        }

        res.setHeader("Allow", "GET, PUT, POST, DELETE");
        json(res, 405, { error: "method not allowed" });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // ADMIN_UPLOAD_TOKEN is a server-side secret and deliberately has
  // no VITE_ prefix, so it never reaches the bundle. loadEnv with an
  // empty prefix is how the dev middleware gets at it.
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  const base = normalizeBasePath(env.VITE_BASE_PATH || process.env.VITE_BASE_PATH);

  return {
  base,
  plugins: [
    react(),
    tailwindcss(),
    jsxLocPlugin(),
    localQuestionBankPlugin(env.ADMIN_UPLOAD_TOKEN || ""),
  ],
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
  };
});
