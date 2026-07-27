# Курс ПОТЭЭ

Статический учебный сайт на Astro для самостоятельного изучения Правил по охране труда при эксплуатации электроустановок.

Сайт устроен как курс: раздел или приложение открывается отдельной страницей, внутри есть материал, презентация и проверочный тест. Результаты тестов и отметка об изучении сохраняются локально в браузере через `localStorage`.

## Структура

```text
source/
  rules/                 # исходные txt-файлы разделов и приложений
  presentations/         # исходные Markdown-презентации, если нужно хранить отдельно
src/
  content/
    modules/
      01-obschie-polozheniya/
        module.md
        presentation.md
        quiz.yaml
  components/
  layouts/
  pages/
scripts/
  generate-content.mjs
  validate-content.mjs
.github/
  workflows/
    deploy.yml
```

## Как запустить локально

```bash
npm install
npm run dev
```

Проверка перед публикацией:

```bash
npm run validate:content
npm run build
```

## Как добавить новый раздел

1. Положите исходный `.txt` в `source/rules/`.
2. Назовите файл по существующему шаблону: `III. НАЗВАНИЕ.txt` или `Приложение 9 НАЗВАНИЕ.txt`.
3. Запустите генерацию:

```bash
npm run generate:content
```

Генератор создаст папку в `src/content/modules/` и добавит `module.md`, `presentation.md`, `quiz.yaml`.

## Как добавить презентацию из NotebookLM

Откройте папку нужного модуля в `src/content/modules/` и замените содержимое `presentation.md`, оставив frontmatter сверху:

```markdown
---
title: "Презентация: I. ОБЩИЕ ПОЛОЖЕНИЯ"
moduleSlug: "01-obschie-polozheniya"
draft: false
---

# I. ОБЩИЕ ПОЛОЖЕНИЯ

## Слайд 1. Название

Текст слайда.
```

Презентация автоматически делится на слайды по заголовкам второго уровня `##`. Таблицы, списки и обычный Markdown поддерживаются.

## Как добавить тест

Файл теста находится рядом с материалом: `src/content/modules/<slug>/quiz.yaml`.

`answer` указывается как номер правильного варианта, начиная с `1`.

```yaml
title: "Проверка по разделу I"
moduleSlug: "01-obschie-polozheniya"
draft: false
questions:
  - type: single
    text: "Вопрос"
    options:
      - "Вариант 1"
      - "Вариант 2"
      - "Вариант 3"
    answer: 1
    explanation: "Почему этот ответ правильный"
    source: "Пункт 1.1"
```

Для готовых тестов поставьте `draft: false`. Для заготовок оставляйте `draft: true`.

## GitHub Pages

В `astro.config.mjs` сейчас стоят безопасные placeholders:

```js
const githubUsername = "github-username";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "repo-name";
```

Перед публикацией замените `github-username` на ваш GitHub username. Имя репозитория GitHub Actions подставит автоматически из `GITHUB_REPOSITORY`; fallback `repo-name` нужен только для ручной локальной проверки Pages-base.

В настройках репозитория GitHub откройте `Settings -> Pages` и выберите источник публикации `GitHub Actions`.

После push в ветку `main` workflow `.github/workflows/deploy.yml` выполнит:

```bash
npm install
npm run validate:content
npm run build
```

Затем содержимое `dist/` будет опубликовано на GitHub Pages.
