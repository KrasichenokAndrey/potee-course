import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const root = process.cwd();
const modulesDir = path.join(root, "src", "content", "modules");

if (!fs.existsSync(modulesDir)) {
  throw new Error("src/content/modules does not exist. Run npm run generate:content first.");
}

const errors = [];
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
  if (!fs.existsSync(quizPath)) continue;

  const quiz = YAML.parse(fs.readFileSync(quizPath, "utf8"));
  if (!quiz?.moduleSlug) errors.push(`${rel}: quiz.yaml must include moduleSlug`);
  if (!Array.isArray(quiz?.questions)) errors.push(`${rel}: quiz.yaml questions must be an array`);

  quiz?.questions?.forEach((question, index) => {
    if (question.type !== "single") errors.push(`${rel}: question ${index + 1} must use type: single`);
    if (!Array.isArray(question.options) || question.options.length < 2) {
      errors.push(`${rel}: question ${index + 1} must have at least two options`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 1 || question.answer > question.options.length) {
      errors.push(`${rel}: question ${index + 1} answer must be a 1-based option number`);
    }
  });
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${moduleDirs.length} modules.`);
