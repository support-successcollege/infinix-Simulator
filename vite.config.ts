import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { createAuthService } from "./api/_lib/userAuth";
import { fileHistoryStore, fileStore } from "./api/_lib/userStores";
import { createHistoryService } from "./api/_lib/history";
import { createGradeService, memoryQuota, openQuestionsOf, type Grader } from "./api/_lib/grading";

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
function localQuestionBankPlugin(adminToken: string, env: Record<string, string>): Plugin {
  const sourcePath = path.resolve(import.meta.dirname, "..", "question_bank_infinitycloser.json");
  const publishedPath = path.resolve(import.meta.dirname, ".local-question-bank.json");

  const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  // Same rule as the Vercel function: the admin token, or a signed-in manager.
  const authorized = async (req: import("node:http").IncomingMessage) => {
    const header = req.headers.authorization || "";
    if (adminToken && header.startsWith("Bearer ") && header.slice(7) === adminToken) return true;
    const secret = env.AUTH_SECRET || "local-dev-secret";
    const auth = createAuthService(fileStore(path.resolve(import.meta.dirname, ".local-users.json"), secret), {
      ...env,
      AUTH_SECRET: secret,
    });
    return auth.isManager(header);
  };

  const readBody = (req: import("node:http").IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", chunk => { chunks.push(Buffer.from(chunk)); });
      req.on("end", () => {
        const raw = Buffer.concat(chunks);
        const gz = String(req.headers["x-bank-encoding"] || "").toLowerCase() === "gzip";
        resolve((gz ? gunzipSync(raw) : raw).toString("utf8"));
      });
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
          if (!(await authorized(req))) {
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
          if (!(await authorized(req))) {
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

/**
 * Dev stand-in for `api/auth.ts`: the same service, with the user
 * document in a git-ignored file instead of Vercel Blob.
 */
function localAuthPlugin(env: Record<string, string>): Plugin {
  const secret = env.AUTH_SECRET || "local-dev-secret";
  const filePath = path.resolve(import.meta.dirname, ".local-users.json");
  return {
    name: "local-auth",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/auth", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: unknown = undefined;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        const service = createAuthService(fileStore(filePath, secret), { ...env, AUTH_SECRET: secret });
        const out = await service.handle({
          method: req.method || "GET",
          action: url.searchParams.get("action") || "",
          id: url.searchParams.get("id") || undefined,
          body,
          authorization: req.headers.authorization,
        });
        res.statusCode = out.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(out.body));
      });

      // Dev stand-in for `api/history.ts`, same service, files on disk.
      server.middlewares.use("/api/history", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: unknown = undefined;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        const auth = createAuthService(fileStore(filePath, secret), { ...env, AUTH_SECRET: secret });
        const history = createHistoryService(
          fileHistoryStore(path.resolve(import.meta.dirname, ".local-history"), secret),
          auth.currentUser
        );
        const out = await history.handle({ method: req.method || "GET", body, authorization: req.headers.authorization });
        res.statusCode = out.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(out.body));
      });

      // Dev stand-in for `api/grade.ts`. No API key locally, so a stub
      // grader gives half of each criterion to any answer of some length;
      // enough to exercise the screens, not a grade.
      const quota = memoryQuota();
      const stubGrader: Grader = async (question, answers) =>
        question.parts.map(part => ({
          label: part.label,
          score: 0,
          max: part.points,
          feedback: "בדיקה מקומית לבדיקת המסכים בלבד, לא ציון אמיתי.",
          criteria: part.rubric.map((r, index) => ({
            index,
            awarded: (answers[part.label] || "").length > 40 ? r.points / 2 : 0,
            max: r.points,
            note: "",
          })),
        }));
      server.middlewares.use("/api/grade", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: unknown = undefined;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        const auth = createAuthService(fileStore(filePath, secret), { ...env, AUTH_SECRET: secret });
        const bankPath = path.resolve(import.meta.dirname, ".local-question-bank.json");
        const service = createGradeService({
          currentUser: auth.currentUser,
          findQuestion: async id =>
            fs.existsSync(bankPath) ? openQuestionsOf(JSON.parse(fs.readFileSync(bankPath, "utf8"))).get(id) ?? null : null,
          grader: stubGrader,
          quota,
        });
        const out = await service.handle({ method: req.method || "POST", body, authorization: req.headers.authorization });
        res.statusCode = out.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(out.body));
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
    localQuestionBankPlugin(env.ADMIN_UPLOAD_TOKEN || "", env),
    localAuthPlugin(env),
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
