import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifestPath, planImport, readModules, renderPresentation, sha256, validatePresentations } from "./lib/presentations.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: node scripts/import-presentations.mjs [--dry-run]");
const plans = planImport(root); // Validate every mapping and source before writing anything.
const modules = readModules(root);
const slides = plans.flatMap((entry) => entry.slides);
for (const entry of plans) {
  const dir = path.join(root, entry.assetDirectory);
  if (fs.existsSync(dir)) {
    const expected = new Set(entry.slides.map((slide) => path.basename(slide.copy)));
    if (fs.readdirSync(dir).some((name) => !expected.has(name))) throw new Error(`Unexpected files in ${entry.assetDirectory}; review references before removing obsolete copies.`);
  }
}
console.log(plans.map((entry) => `${entry.number}: ${entry.slides.length} PNG -> ${entry.moduleSlug}`).join("\n"));
console.log(`${plans.length} presentations, ${slides.length} PNG.`);
if (args.includes("--dry-run")) process.exit(0);

let copied = 0;
const writeChanged = (file, content) => {
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) fs.writeFileSync(file, content, "utf8");
};
// Only byte copies. Originals are never opened for writing or renamed.
for (const slide of slides) {
  const source = path.join(root, slide.original);
  const target = path.join(root, slide.copy);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target) || sha256(target) !== slide.sha256) {
    fs.copyFileSync(source, target);
    copied++;
  }
  if (sha256(source) !== slide.sha256 || sha256(target) !== slide.sha256) throw new Error(`SHA-256 mismatch: ${slide.copy}`);
}
for (const entry of plans) {
  const module = modules.find((module) => module.slug === entry.moduleSlug);
  writeChanged(path.join(root, entry.presentation), renderPresentation(module.raw, entry.slides, entry.title));
}
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
writeChanged(path.join(root, manifestPath), JSON.stringify({ version: 1, hashAlgorithm: "SHA-256", ordering: "Numeric filenames, consecutive from 1", presentations: plans }, null, 2) + "\n");
const errors = validatePresentations(root, { sources: true });
if (errors.length) throw new Error(errors.join("\n"));
console.log(`Imported and SHA-256 verified ${slides.length} slides (${copied} copies written). Manifest: ${manifestPath}`);
