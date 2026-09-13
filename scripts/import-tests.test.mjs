import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { validateQuiz, matchModule, extractQuiz, planImport, checkImportedTests } from "./lib/tests.mjs";

const example = () => ({ title: "Тест", moduleSlug: "01-test", draft: false, questions: [
  { type: "single", text: "Вопрос?", options: ["Первый", "Второй"], answer: 2 }
] });
const modules = [{ kind: "rule", number: "I", slug: "01-test" }, { kind: "appendix", number: "1", slug: "app-01-test" }];
const markdown = (quiz) => `# Тест\r\n\r\n\`\`\`yaml\r\n${YAML.stringify(quiz).replaceAll("\n", "\r\n")}\`\`\`\r\n`;

test("optional explanations and sources are not invented", () => {
  assert.deepEqual(validateQuiz(example(), "01-test"), []);
  assert.deepEqual(extractQuiz(Buffer.from(markdown(example())), "test.md").quiz, example());
});

for (const [name, change, expected] of [
  ["no questions", (q) => { q.questions = []; }, /non-empty array/],
  ["questions is not an array", (q) => { q.questions = {}; }, /non-empty array/],
  ["empty question", (q) => { q.questions[0].text = "  "; }, /text must not be empty/],
  ["missing options", (q) => { delete q.questions[0].options; }, /at least two/],
  ["empty option", (q) => { q.questions[0].options[0] = " "; }, /at least two/],
  ["zero-based answer", (q) => { q.questions[0].answer = 0; }, /1-based/],
  ["answer out of range", (q) => { q.questions[0].answer = 3; }, /1-based/],
  ["fractional answer", (q) => { q.questions[0].answer = 1.5; }, /1-based/],
  ["wrong slug", (q) => { q.moduleSlug = "another"; }, /moduleSlug must be 01-test/],
  ["multiple answers require an explicit extension", (q) => { q.questions[0].type = "multiple"; q.questions[0].answer = [1, 2]; }, /unsupported type/],
  ["unknown fields cannot be silently lost", (q) => { q.questions[0].hint = "подсказка"; }, /unsupported field/]
]) {
  test(name, () => {
    const quiz = example();
    change(quiz);
    assert.match(validateQuiz(quiz, "01-test").join("\n"), expected);
  });
}

test("mapping uses section/appendix numbers and rejects ambiguity", () => {
  assert.equal(matchModule("I. НАЗВАНИЕ.md", modules).slug, "01-test");
  assert.equal(matchModule("Приложение 1 НАЗВАНИЕ.md", modules).slug, "app-01-test");
  assert.throws(() => matchModule("Без номера.md", modules), /found 0/);
  assert.throws(() => matchModule("II. НАЗВАНИЕ.md", modules), /found 0/);
  assert.throws(() => matchModule("I. НАЗВАНИЕ.md", [...modules, modules[0]]), /found 2/);
});

test("missing, duplicate, or malformed YAML blocks are rejected", () => {
  assert.throws(() => extractQuiz(Buffer.from("# Только заголовок"), "test.md"), /exactly one/);
  assert.throws(() => extractQuiz(Buffer.from(markdown(example()).repeat(2)), "test.md"), /exactly one/);
  assert.throws(() => extractQuiz(Buffer.from("```yaml\nquestions: [\n```\n"), "test.md"));
});

function fixture(t) {
  const prefix = path.join(fs.realpathSync(os.tmpdir()), "potee-import-");
  const root = fs.mkdtempSync(prefix);
  t.after(() => {
    const resolved = fs.realpathSync(root);
    if (!resolved.startsWith(prefix) || path.dirname(resolved) !== path.dirname(prefix)) throw new Error("Unsafe fixture cleanup path");
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const module of modules) {
    const dir = path.join(root, "src/content/modules", module.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "module.md"), `---\n${YAML.stringify({ ...module, order: module.kind === "rule" ? 1 : 1001 })}---\n`);
    fs.writeFileSync(path.join(dir, "quiz.yaml"), YAML.stringify({ ...example(), moduleSlug: module.slug, title: "Старый тест" }));
  }
  const originals = path.join(root, "Исходники/Тесты");
  fs.mkdirSync(originals, { recursive: true });
  fs.writeFileSync(path.join(originals, "I. ТЕСТ.md"), markdown(example()));
  const script = fileURLToPath(new URL("./import-tests.mjs", import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  return { root, originals, run };
}

test("CLI copies byte-for-byte, replaces only mapped quizzes and is idempotent", (t) => {
  const { root, originals, run } = fixture(t);
  const original = fs.readFileSync(path.join(originals, "I. ТЕСТ.md"));
  const appendix = path.join(root, "src/content/modules/app-01-test/quiz.yaml");
  const oldAppendix = fs.readFileSync(appendix);
  const first = run("--copy-from-originals");
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(fs.readFileSync(path.join(originals, "I. ТЕСТ.md")), original);
  assert.deepEqual(fs.readFileSync(path.join(root, "source/tests/I. ТЕСТ.md")), original);
  assert.deepEqual(fs.readFileSync(appendix), oldAppendix);
  const repeated = run("--copy-from-originals");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /copied 0 files; replaced 0 quiz files/);
  assert.deepEqual(checkImportedTests(root), []);
  // A checkout without the ignored original folder can import from working copies.
  const isolated = path.join(root, "checkout");
  fs.mkdirSync(isolated);
  fs.cpSync(path.join(root, "source"), path.join(isolated, "source"), { recursive: true });
  fs.cpSync(path.join(root, "src"), path.join(isolated, "src"), { recursive: true });
  assert.deepEqual(checkImportedTests(isolated), []);
});

test("bad sources prevent all copies and replacements", (t) => {
  const { root, originals, run } = fixture(t);
  fs.writeFileSync(path.join(originals, "Без номера.md"), markdown(example()));
  const target = path.join(root, "src/content/modules/01-test/quiz.yaml");
  const before = fs.readFileSync(target);
  assert.equal(run("--copy-from-originals").status, 1);
  assert.equal(fs.existsSync(path.join(root, "source/tests")), false);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("duplicate and non-Markdown sources stop the plan", (t) => {
  const { root, originals } = fixture(t);
  fs.writeFileSync(path.join(originals, "I. ДУБЛЬ.md"), markdown(example()));
  assert.throws(() => planImport(root, originals), /duplicate test/);
  fs.writeFileSync(path.join(originals, "0.json"), "{}");
  assert.throws(() => planImport(root, originals), /unmapped test source/);
});

test("validation detects stale YAML, new originals and missing manifest entries", (t) => {
  const { root, originals, run } = fixture(t);
  assert.equal(run("--copy-from-originals").status, 0);
  const target = path.join(root, "src/content/modules/01-test/quiz.yaml");
  fs.writeFileSync(target, YAML.stringify({ ...example(), title: "Устаревший тест" }));
  assert.match(checkImportedTests(root).join("\n"), /differs from I/);
  assert.equal(run().status, 0);
  fs.writeFileSync(path.join(originals, "Приложение 1 ТЕСТ.md"), markdown({ ...example(), moduleSlug: "app-01-test" }));
  assert.match(checkImportedTests(root).join("\n"), /differs from source\/tests/);
  assert.equal(run("--copy-from-originals").status, 0);
  const manifestPath = path.join(root, "source/tests/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.files.pop();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.match(checkImportedTests(root).join("\n"), /manifest.json does not match/);
});
