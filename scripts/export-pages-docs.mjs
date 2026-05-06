import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(projectRoot, "dist", "public");
const targetDir = path.resolve(projectRoot, "docs");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Build output not found at: ${sourceDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log(`Exported GitHub Pages content to ${targetDir}`);
