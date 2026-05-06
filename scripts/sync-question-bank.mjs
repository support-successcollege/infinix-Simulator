import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(projectRoot, "..", "question_bank_infinitycloser.json");
const publicDir = path.resolve(projectRoot, "client", "public");
const targetPath = path.resolve(publicDir, "question_bank_infinitycloser.json");
const fallbackTemplate = {
  meta: {
    version: "2.0.0",
    language: "he",
    format: "InfinityCloser-compatible",
    questionsPerCategory: 0,
    scoring: "Use correctIndex to validate answers",
    note: "Auto-generated fallback question bank for CI builds",
  },
  categories: {},
};

fs.mkdirSync(publicDir, { recursive: true });

if (fs.existsSync(sourcePath)) {
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Synced question bank from root file to ${targetPath}`);
} else if (fs.existsSync(targetPath)) {
  console.log(`Root question bank missing; using existing public file at ${targetPath}`);
} else {
  fs.writeFileSync(targetPath, `${JSON.stringify(fallbackTemplate, null, 2)}\n`, "utf8");
  console.log(`Root question bank missing; created fallback file at ${targetPath}`);
}
