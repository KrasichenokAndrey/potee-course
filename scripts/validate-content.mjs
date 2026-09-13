import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { validateQuiz, checkImportedTests } from "./lib/tests.mjs";

const root = process.cwd();
const modulesDir = path.join(root, "src", "content", "modules");

if (!fs.existsSync(modulesDir)) {
  throw new Error("src/content/modules does not exist. Run npm run generate:content first.");
}

const errors = [];
const rulePointPattern = /^\d+\.\d+\./;
const moduleDirs = fs
  .readdirSync(modulesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(modulesDir, entry.name));

for (const dir of moduleDirs) {
  const rel = path.relative(root, dir);
  for (const file of ["module.md", "presentation.md", "quiz.yaml"]) {
    if (!fs.existsSync(path.join(dir, file))) {
      errors.push(`${rel}: missing ${file}`);
    }
  }

  const quizPath = path.join(dir, "quiz.yaml");
  const modulePath = path.join(dir, "module.md");

  if (fs.existsSync(modulePath)) {
    const moduleLines = fs.readFileSync(modulePath, "utf8").replace(/\r\n/g, "\n").split("\n");
    moduleLines.forEach((line, index) => {
      if (!rulePointPattern.test(line.trim()) || index === 0) return;

      const previousLine = moduleLines[index - 1]?.trim();
      if (previousLine !== "") {
        errors.push(`${rel}: rule point on line ${index + 1} must start after a blank line`);
      }
    });
  }

  if (!fs.existsSync(quizPath)) continue;

  try {
    const quiz = YAML.parse(fs.readFileSync(quizPath, "utf8"));
    errors.push(...validateQuiz(quiz, path.basename(dir)).map((error) => `${rel}: ${error}`));
  } catch (error) {
    errors.push(`${rel}: invalid quiz.yaml: ${error.message}`);
  }
}

errors.push(...checkImportedTests(root));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${moduleDirs.length} modules.`);
