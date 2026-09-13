import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import YAML from "yaml";

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export function validateQuiz(quiz, expectedSlug) {
  const errors = [];
  if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) return ["quiz must be an object"];
  if (!hasText(quiz.title)) errors.push("title must not be empty");
  if (!hasText(quiz.moduleSlug)) errors.push("moduleSlug must not be empty");
  if (expectedSlug && quiz.moduleSlug !== expectedSlug) errors.push(`moduleSlug must be ${expectedSlug}, got ${quiz.moduleSlug}`);
  if (quiz.draft !== undefined && typeof quiz.draft !== "boolean") errors.push("draft must be a boolean");
  for (const key of Object.keys(quiz)) {
    if (!["title", "moduleSlug", "draft", "questions"].includes(key)) errors.push(`unsupported quiz field: ${key}`);
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push("questions must be a non-empty array");
    return errors;
  }
  quiz.questions.forEach((question, index) => {
    const label = `question ${index + 1}`;
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      errors.push(`${label} must be an object`);
      return;
    }
    for (const key of Object.keys(question)) {
      if (!["type", "text", "options", "answer", "explanation", "source"].includes(key)) errors.push(`${label}: unsupported field ${key}`);
    }
    if (question.type !== "single") errors.push(`${label}: unsupported type ${question.type}; only single is supported`);
    if (!hasText(question.text)) errors.push(`${label}: text must not be empty`);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => !hasText(option))) {
      errors.push(`${label}: options must contain at least two non-empty texts`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 1 || question.answer > (question.options?.length ?? 0)) {
      errors.push(`${label}: answer must be a 1-based option number within options`);
    }
    for (const key of ["explanation", "source"]) {
      if (question[key] !== undefined && typeof question[key] !== "string") errors.push(`${label}: ${key} must be a string when present`);
    }
  });
  return errors;
}

export function readModules(root) {
  const directory = path.join(root, "src/content/modules");
  return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const raw = fs.readFileSync(path.join(directory, entry.name, "module.md"), "utf8");
    const frontmatter = raw.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) throw new Error(`${entry.name}: missing module frontmatter`);
    return { ...YAML.parse(frontmatter[1]), slug: entry.name };
  }).sort((a, b) => a.order - b.order);
}

export function matchModule(file, modules) {
  const rule = file.match(/^([IVXLCDM]+)\.\s+.+\.md$/i);
  const appendix = file.match(/^Приложение\s+(\d+)[.\s]+.+\.md$/i);
  const matches = modules.filter((module) => rule
    ? module.kind === "rule" && module.number === rule[1].toUpperCase()
    : appendix && module.kind === "appendix" && String(module.number) === appendix[1]);
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one module by section/appendix number, found ${matches.length}`);
  return matches[0];
}

export function extractQuiz(raw, label) {
  const text = raw.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const fences = [...text.matchAll(/^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)];
  if (fences.length !== 1 || !/^ya?ml$/i.test(fences[0][2].trim())) {
    throw new Error(`${label}: expected exactly one YAML code block`);
  }
  const yaml = `${fences[0][3].trimEnd()}\n`;
  return { yaml, quiz: YAML.parse(yaml) };
}

export function workingCopyName(file, module) {
  // Linux limits each filename to 255 bytes, including multibyte Cyrillic text.
  if (Buffer.byteLength(file, "utf8") <= 255) return file;
  const number = module.kind === "rule" ? module.number : `Приложение ${module.number}`;
  return `${number}. tests.md`;
}

// Build and validate the entire plan before the caller writes any copies or quizzes.
export function planImport(root, directory) {
  const modules = readModules(root);
  const seen = new Set();
  const files = fs.readdirSync(directory, { withFileTypes: true });
  const isWorkingDirectory = path.resolve(directory) === path.resolve(root, "source/tests");
  const manifestPath = path.join(directory, "manifest.json");
  const recordedFiles = isWorkingDirectory && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8")).files : [];
  const entries = files.filter((file) => !isWorkingDirectory || file.name !== "manifest.json").map((file) => {
    if (!file.isFile() || !file.name.toLowerCase().endsWith(".md")) throw new Error(`${file.name}: unmapped test source (expected Markdown file)`);
    const module = matchModule(file.name, modules);
    const originalFile = isWorkingDirectory
      ? recordedFiles.find((entry) => entry.file === file.name)?.originalFile ?? file.name : file.name;
    if (matchModule(originalFile, modules).slug !== module.slug) throw new Error(`${file.name}: originalFile refers to another module`);
    const workingFile = workingCopyName(originalFile, module);
    if (isWorkingDirectory && file.name !== workingFile) throw new Error(`${file.name}: working copy must be named ${workingFile} for Linux compatibility`);
    if (seen.has(module.slug)) throw new Error(`${file.name}: duplicate test for ${module.slug}`);
    seen.add(module.slug);
    const raw = fs.readFileSync(path.join(directory, file.name));
    const { yaml, quiz } = extractQuiz(raw, file.name);
    const errors = validateQuiz(quiz, module.slug);
    if (errors.length) throw new Error(`${file.name}:\n${errors.join("\n")}`);
    return { file: workingFile, originalFile, raw, yaml, quiz, module, sha256: createHash("sha256").update(raw).digest("hex") };
  }).sort((a, b) => a.module.order - b.module.order);
  if (!entries.length) throw new Error(`${directory}: no test sources found`);
  return entries;
}

export function importManifest(entries) {
  return {
    format: 2,
    files: entries.map(({ file, originalFile, module, quiz, sha256 }) => ({ file, originalFile, moduleSlug: module.slug, questions: quiz.questions.length, sha256 }))
  };
}

export function checkImportedTests(root) {
  const errors = [];
  try {
    const directory = path.join(root, "source/tests");
    const entries = planImport(root, directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    if (!isDeepStrictEqual(manifest, importManifest(entries))) errors.push("source/tests/manifest.json does not match working sources (missing/changed/unmapped files); run npm run import:tests");
    for (const entry of entries) {
      const target = path.join(root, "src/content/modules", entry.module.slug, "quiz.yaml");
      try {
        if (!isDeepStrictEqual(YAML.parse(fs.readFileSync(target, "utf8")), entry.quiz)) errors.push(`${entry.module.slug}/quiz.yaml differs from ${entry.file}; run npm run import:tests`);
      } catch (error) {
        errors.push(`${entry.module.slug}/quiz.yaml: ${error.message}`);
      }
    }
    const originals = path.join(root, "Исходники/Тесты");
    if (fs.existsSync(originals)) {
      const originalEntries = planImport(root, originals);
      if (!isDeepStrictEqual(importManifest(originalEntries), importManifest(entries))) errors.push("Исходники/Тесты differs from source/tests; run npm run import:tests -- --copy-from-originals");
    }
  } catch (error) {
    errors.push(`Test import: ${error.message}`);
  }
  return errors;
}
