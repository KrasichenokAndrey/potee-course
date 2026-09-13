import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import YAML from "yaml";
import { planImport, importManifest, checkImportedTests } from "./lib/tests.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
if (args.some((arg) => !["--copy-from-originals", "--check"].includes(arg)) || args.length > 1) {
  console.error("Usage: node scripts/import-tests.mjs [--copy-from-originals | --check]");
  process.exit(1);
}

try {
  if (args.includes("--check")) {
    const errors = checkImportedTests(root);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Imported tests match the manifest, working copies and available originals.");
  } else {
    const copyOriginals = args.includes("--copy-from-originals");
    const directory = path.join(root, "source/tests");
    const source = copyOriginals ? path.join(root, "Исходники/Тесты") : directory;
    const entries = planImport(root, source);
    if (copyOriginals && fs.existsSync(directory)) {
      const allowed = new Set(["manifest.json", ...entries.map((entry) => entry.file)]);
      for (const file of fs.readdirSync(directory)) {
        if (!allowed.has(file)) throw new Error(`source/tests/${file}: no matching original; resolve the extra working file before importing`);
      }
    }
    fs.mkdirSync(directory, { recursive: true });
    let copied = 0;
    let replaced = 0;
    for (const entry of entries) {
      if (copyOriginals) {
        const target = path.join(directory, entry.file);
        if (!fs.existsSync(target) || !fs.readFileSync(target).equals(entry.raw)) {
          fs.writeFileSync(target, entry.raw);
          copied++;
        }
      }
      const target = path.join(root, "src/content/modules", entry.module.slug, "quiz.yaml");
      let previous;
      try { previous = YAML.parse(fs.readFileSync(target, "utf8")); } catch { /* Replace a missing or invalid old quiz. */ }
      if (!isDeepStrictEqual(previous, entry.quiz)) {
        fs.writeFileSync(target, entry.yaml, "utf8");
        replaced++;
      }
      console.log(`${entry.module.number}: ${entry.file} -> ${entry.module.slug}/quiz.yaml (${entry.quiz.questions.length})`);
    }
    const manifestPath = path.join(directory, "manifest.json");
    const manifest = `${JSON.stringify(importManifest(entries), null, 2)}\n`;
    if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, "utf8") !== manifest) fs.writeFileSync(manifestPath, manifest);
    console.log(`Imported ${entries.length} tests / ${entries.reduce((total, entry) => total + entry.quiz.questions.length, 0)} questions; copied ${copied} files; replaced ${replaced} quiz files. Originals are read-only.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
