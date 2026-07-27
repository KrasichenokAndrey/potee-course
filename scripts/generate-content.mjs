import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRulesDir = path.join(root, "source", "rules");
const sourcePresentationsDir = path.join(root, "source", "presentations");
const modulesDir = path.join(root, "src", "content", "modules");

const romanValues = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000
};

const translit = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
};

function romanToNumber(value) {
  let total = 0;
  let previous = 0;
  for (const char of [...value.toUpperCase()].reverse()) {
    const current = romanValues[char] ?? 0;
    total += current < previous ? -current : current;
    previous = Math.max(previous, current);
  }
  return total;
}

function slugify(value, prefix) {
  const base = value
    .toLowerCase()
    .split("")
    .map((char) => translit[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 68)
    .replace(/-+$/g, "");

  return `${prefix}-${base || "module"}`;
}

function yamlString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveTxtSourcesIntoSourceDir() {
  ensureDir(sourceRulesDir);
  const rootFiles = fs.readdirSync(root, { withFileTypes: true });

  rootFiles
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .forEach((entry) => {
      const from = path.join(root, entry.name);
      const to = path.join(sourceRulesDir, entry.name);
      if (!fs.existsSync(to)) {
        fs.renameSync(from, to);
      }
    });
}

function collectSources() {
  const files = fs
    .readdirSync(sourceRulesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => entry.name);

  const rules = [];
  const appendices = [];

  files.forEach((file) => {
    const ruleMatch = file.match(/^([IVXLCDM]+)\.\s+(.+)\.txt$/i);
    const appendixMatch = file.match(/^Приложение\s+(\d+)\s+(.+)\.txt$/i);

    if (ruleMatch) {
      const roman = ruleMatch[1].toUpperCase();
      const order = romanToNumber(roman);
      rules.push({
        file,
        number: roman,
        order,
        kind: "rule",
        title: `${roman}. ${ruleMatch[2]}`,
        slug: slugify(ruleMatch[2], String(order).padStart(2, "0"))
      });
      return;
    }

    if (appendixMatch) {
      const order = Number(appendixMatch[1]);
      appendices.push({
        file,
        number: appendixMatch[1],
        order: 1000 + order,
        kind: "appendix",
        title: `Приложение ${appendixMatch[1]}. ${appendixMatch[2]}`,
        slug: slugify(appendixMatch[2], `app-${String(order).padStart(2, "0")}`)
      });
    }
  });

  return [...rules.sort((a, b) => a.order - b.order), ...appendices.sort((a, b) => a.order - b.order)];
}

function sourceBodyFor(file, title) {
  const raw = stripBom(fs.readFileSync(path.join(sourceRulesDir, file), "utf8")).replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const first = lines[0]?.trim();
  const body = first && title.toLowerCase().includes(first.toLowerCase()) ? lines.slice(1).join("\n") : raw;
  return body.trim();
}

function frontmatter(fields) {
  const lines = Object.entries(fields).map(([key, value]) => {
    if (typeof value === "number" || typeof value === "boolean") return `${key}: ${value}`;
    return `${key}: ${yamlString(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function writeModule(entry) {
  const dir = path.join(modulesDir, entry.slug);
  ensureDir(dir);
  const body = sourceBodyFor(entry.file, entry.title);
  const content =
    frontmatter({
      title: entry.title,
      number: entry.number,
      order: entry.order,
      kind: entry.kind,
      sourceFile: entry.file
    }) + `# ${entry.title}\n\n${body}\n`;

  fs.writeFileSync(path.join(dir, "module.md"), content, "utf8");
}

function findPreparedPresentation(entry) {
  const candidates = [
    path.join(root, entry.file.replace(/\.txt$/i, ".md")),
    path.join(sourceRulesDir, entry.file.replace(/\.txt$/i, ".md")),
    path.join(sourcePresentationsDir, entry.file.replace(/\.txt$/i, ".md"))
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function writePresentation(entry) {
  const dir = path.join(modulesDir, entry.slug);
  const prepared = findPreparedPresentation(entry);

  if (prepared) {
    const raw = stripBom(fs.readFileSync(prepared, "utf8")).replace(/\r\n/g, "\n").trim();
    fs.writeFileSync(
      path.join(dir, "presentation.md"),
      frontmatter({
        title: `Презентация: ${entry.title}`,
        moduleSlug: entry.slug,
        draft: false
      }) + `${raw}\n`,
      "utf8"
    );
    return;
  }

  const template = `${frontmatter({
    title: `Презентация: ${entry.title}`,
    moduleSlug: entry.slug,
    draft: true
  })}# ${entry.title}

## Слайд 1. Смысл раздела

- Замените этот шаблон структурой из NotebookLM или чата.
- Сохраните ключевую мысль раздела.
- Укажите пункты Правил, на которые опирается слайд.

## Слайд 2. Ключевые требования

| Тема | Что вынести на слайд | Источник |
|---|---|---|
| Требование | Краткая формулировка | Пункт |

## Слайд 3. Проверка понимания

- Добавьте учебный пример.
- Завершите слайд одним вопросом для самопроверки.
`;

  fs.writeFileSync(path.join(dir, "presentation.md"), template, "utf8");
}

function quizFor(entry) {
  if (entry.order === 1) {
    return {
      title: "Проверка по разделу I",
      draft: false,
      questions: [
        {
          type: "single",
          text: "Что устанавливают Правила по охране труда при эксплуатации электроустановок?",
          options: [
            "Государственные нормативные требования охраны труда при эксплуатации электроустановок",
            "Порядок бухгалтерского учета электроэнергии",
            "Тарифы на технологическое присоединение"
          ],
          answer: 1,
          explanation:
            "Пункт 1.1 прямо указывает, что Правила устанавливают государственные нормативные требования охраны труда при эксплуатации электроустановок.",
          source: "Пункт 1.1"
        },
        {
          type: "single",
          text: "На кого возлагаются обязанности по обеспечению безопасных условий и охраны труда?",
          options: ["На работника", "На работодателя", "На производителя оборудования"],
          answer: 2,
          explanation:
            "В пункте 1.2 сказано, что эти обязанности возлагаются на работодателя.",
          source: "Пункт 1.2"
        },
        {
          type: "single",
          text: "Допускается ли электронный документооборот в области охраны труда?",
          options: [
            "Да, если используется электронная подпись или иной способ идентификации личности работника",
            "Нет, документы должны быть только на бумаге",
            "Да, но только для журналов учета"
          ],
          answer: 1,
          explanation:
            "Пункт 1.5 допускает электронный документооборот при наличии электронной подписи или другого способа идентификации.",
          source: "Пункт 1.5"
        }
      ]
    };
  }

  if (entry.order === 2) {
    return {
      title: "Проверка по разделу II",
      draft: false,
      questions: [
        {
          type: "single",
          text: "Что должен пройти работник до допуска к самостоятельной работе?",
          options: [
            "Только вводный инструктаж",
            "Обучение безопасным методам и приемам выполнения работ",
            "Только медицинский осмотр без проверки знаний"
          ],
          answer: 2,
          explanation:
            "Раздел II начинается с требований к обучению безопасным методам и приемам выполнения работ.",
          source: "Пункт 2.1"
        },
        {
          type: "single",
          text: "Кому присваивается группа I по электробезопасности при наличии риска поражения током?",
          options: [
            "Неэлектротехническому персоналу",
            "Только руководителям организации",
            "Только работникам оперативного персонала"
          ],
          answer: 1,
          explanation:
            "Группа I относится к неэлектротехническому персоналу, если при работе может возникнуть опасность поражения электрическим током.",
          source: "Пункт 2.3"
        },
        {
          type: "single",
          text: "Где подтверждается право на проведение специальных работ?",
          options: [
            "Только в трудовом договоре",
            "Записью в удостоверении о проверке знаний",
            "В устном распоряжении руководителя"
          ],
          answer: 2,
          explanation:
            "Право на специальные работы подтверждается соответствующей записью в удостоверении.",
          source: "Пункт 2.8"
        }
      ]
    };
  }

  return {
    title: `Проверка: ${entry.title}`,
    draft: true,
    questions: [
      {
        type: "single",
        text: "Замените этот вопрос проверочным вопросом по модулю.",
        options: ["Вариант 1", "Вариант 2", "Вариант 3"],
        answer: 1,
        explanation: "Добавьте пояснение с отсылкой к конкретному пункту Правил.",
        source: "Пункт ..."
      }
    ]
  };
}

function writeQuiz(entry) {
  const quiz = quizFor(entry);
  const questions = quiz.questions
    .map(
      (question) => `  - type: single
    text: ${yamlString(question.text)}
    options:
${question.options.map((option) => `      - ${yamlString(option)}`).join("\n")}
    answer: ${question.answer}
    explanation: ${yamlString(question.explanation)}
    source: ${yamlString(question.source)}
`
    )
    .join("");

  const content = `title: ${yamlString(quiz.title)}
moduleSlug: ${yamlString(entry.slug)}
draft: ${quiz.draft}
questions:
${questions}`;

  fs.writeFileSync(path.join(modulesDir, entry.slug, "quiz.yaml"), content, "utf8");
}

moveTxtSourcesIntoSourceDir();
ensureDir(modulesDir);

const entries = collectSources();
entries.forEach((entry) => {
  writeModule(entry);
  writePresentation(entry);
  writeQuiz(entry);
});

console.log(`Generated ${entries.length} modules in ${path.relative(root, modulesDir)}.`);
