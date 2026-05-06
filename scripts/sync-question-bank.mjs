import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(projectRoot, "..", "question_bank_infinitycloser.json");
const publicDir = path.resolve(projectRoot, "client", "public");
const targetPath = path.resolve(publicDir, "question_bank_infinitycloser.json");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source question bank was not found at: ${sourcePath}`);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
console.log(`Synced question bank to ${targetPath}`);
