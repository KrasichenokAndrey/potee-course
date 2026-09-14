import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";

export const manifestPath = "docs/presentations-manifest.json";
export const sourceDirectory = "Исходники/Презентации";
export const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const posix = (value) => value.split(path.sep).join("/");
export const frontmatter = (raw) => YAML.parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "");
export const slideUrls = (raw) => [...raw.matchAll(/data-slide-src="([^"]+)"/g)].map((match) => match[1]);
const normalize = (value) => value.toUpperCase().replace(/Ё/g, "Е").replace(/[^А-ЯA-Z0-9]/g, "");

// These shortened directory titles were checked against both module titles and title slides.
const titleAliases = {
  XXX: "XXX. ОХРАНА ТРУДА ПРИ ВЫПОЛНЕНИИ РАБОТ ТРАНСФОРМАТОРНЫХ ПОДСТАНЦИЯХ",
  XXXI: "XXXI. ОХРАНА ТРУДА ПРИ ВЫПОЛНЕНИИ РАБОТ НА СИЛОВЫХ ТРАНСФОРМАТОРАХ И РЕАКТОРАХ",
  XXXII: "XXXII. ОХРАНА ТРУДА ПРИ ВЫПОЛНЕНИИ РАБОТ НА ИЗМЕРИТЕЛЬНЫХ ТТ",
  XXXVIII: "XXXVIII. ОХРАНА ТРУДА ПРИ ВЫПОЛНЕНИИ РАБОТ НА ВЛ",
  XXXIX: "XXXIX. ОХРАНА ТРУДА ПРИ ПРОВЕДЕНИИ ИСПЫТАНИЙ И ИЗМЕРЕНИЙ"
};

export function readModules(root) {
  const base = path.join(root, "src/content/modules");
  return fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name: slug }) => {
    const presentation = `src/content/modules/${slug}/presentation.md`;
    const raw = fs.readFileSync(path.join(root, presentation), "utf8");
    return { slug, ...frontmatter(fs.readFileSync(path.join(base, slug, "module.md"), "utf8")), presentation, raw };
  });
}

export function pngInfo(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`Invalid PNG: ${file}`);
  }
  return { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

export function planImport(root) {
  const modules = readModules(root);
  const sourceRoot = path.join(root, sourceDirectory);
  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && /\.png$/i.test(entry.name))) throw new Error("PNG outside a presentation directory: mapping required.");
  const seen = new Set();
  const plans = entries.filter((entry) => entry.isDirectory()).map(({ name }) => {
    const rule = name.match(/^([IVXLCDM]+)\./);
    const appendix = name.match(/^Приложение\s*№?\s*(\d+)\./i);
    const number = rule?.[1] ?? appendix?.[1];
    const kind = rule ? "rule" : "appendix";
    const candidates = modules.filter((module) => module.kind === kind && module.number === number);
    if (!number || candidates.length !== 1 || seen.has(candidates[0]?.slug)) throw new Error(`Ambiguous module mapping: ${name}`);
    const module = candidates[0];
    seen.add(module.slug);
    const sourceTitle = normalize(name);
    const targetTitle = normalize(module.title);
    // VIII has a duplicated, truncated suffix after the complete correct title.
    const duplicatedVIII = number === "VIII" && sourceTitle.startsWith(targetTitle) && sourceTitle.length > targetTitle.length && targetTitle.startsWith(sourceTitle.slice(targetTitle.length));
    const alias = kind === "rule" && titleAliases[number] === name;
    if (sourceTitle !== targetTitle && !duplicatedVIII && !alias) throw new Error(`Title mismatch; review required: ${name} -> ${module.title}`);
    const directory = `${sourceDirectory}/${name}`;
    const files = fs.readdirSync(path.join(root, directory), { withFileTypes: true });
    if (files.some((file) => !file.isFile())) throw new Error(`Nested directory or special entry requires review: ${directory}`);
    const numbered = files.filter((file) => /\.png$/i.test(file.name)).map((file) => {
      const match = file.name.match(/^(\d+)\.png$/i);
      if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error(`Ambiguous slide number: ${directory}/${file.name}`);
      return { name: file.name, number: Number(match[1]) };
    }).sort((a, b) => a.number - b.number);
    if (!numbered.length || numbered.some((file, index) => file.number !== index + 1)) throw new Error(`Slide numbers must be unique and consecutive from 1: ${directory}`);
    const assetDirectory = `public/slides/${kind === "rule" ? "section" : "appendix"}-${String(kind === "rule" ? module.order : number).padStart(2, "0")}`;
    const slides = numbered.map((file) => {
      const original = `${directory}/${file.name}`;
      const copy = `${assetDirectory}/slide-${String(file.number).padStart(3, "0")}.png`;
      return { number: file.number, original, originalAbsolute: posix(path.resolve(root, original)), copy, copyAbsolute: posix(path.resolve(root, copy)), url: copy.slice("public".length), ...pngInfo(path.join(root, original)) };
    });
    return { moduleSlug: module.slug, number, kind, title: module.title, sourceDirectory: directory, mapping: duplicatedVIII ? "number and complete title with duplicated suffix" : alias ? "number and reviewed shortened title/title slide" : "number and title", presentation: module.presentation, assetDirectory, slides };
  }).sort((a, b) => a.moduleSlug.localeCompare(b.moduleSlug, "en"));
  if (!plans.length) throw new Error("No presentation directories found.");
  return plans;
}

export function renderPresentation(raw, slides, title) {
  const header = raw.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0];
  if (!header || !/^draft: (true|false)\r?$/m.test(header)) throw new Error("Expected explicit draft field in presentation frontmatter.");
  const escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return header.replace(/\r\n/g, "\n").replace(/^draft: (true|false)$/m, "draft: false") + "\n\n" + slides.map((slide) => `## Слайд ${slide.number}\n\n<img data-slide-src="${slide.url}" alt="Слайд ${slide.number}. ${escape(title)}" width="${slide.width}" height="${slide.height}" loading="lazy" />\n`).join("\n");
}

export function validatePresentations(root, { sources = false } = {}) {
  const errors = [];
  const modules = readModules(root);
  for (const module of modules) {
    for (const url of slideUrls(module.raw)) {
      if (!/^\/slides\/[a-z0-9/-]+\.png$/.test(url) || url.includes("..")) errors.push(`${module.slug}: unsafe slide URL ${url}`);
      else if (!fs.existsSync(path.join(root, "public", url.slice(1)))) errors.push(`${module.slug}: missing ${url}`);
    }
  }
  const file = path.join(root, manifestPath);
  if (!fs.existsSync(file)) return errors;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.version !== 1) return [...errors, "Unsupported presentation manifest version"];
  const seenModules = new Set();
  const seenCopies = new Set();
  for (const entry of manifest.presentations) {
    if (seenModules.has(entry.moduleSlug)) errors.push(`Duplicate module: ${entry.moduleSlug}`);
    seenModules.add(entry.moduleSlug);
    const module = modules.find((module) => module.slug === entry.moduleSlug);
    if (!module) { errors.push(`Missing module: ${entry.moduleSlug}`); continue; }
    if (frontmatter(module.raw).draft !== false) errors.push(`${module.slug}: imported presentation is still draft`);
    if (frontmatter(module.raw).moduleSlug !== module.slug) errors.push(`${module.slug}: incorrect moduleSlug`);
    if (JSON.stringify(slideUrls(module.raw)) !== JSON.stringify(entry.slides.map((slide) => slide.url))) errors.push(`${module.slug}: slide order/count/URLs differ from manifest`);
    if (module.raw.replace(/\r\n/g, "\n") !== renderPresentation(module.raw, entry.slides, entry.title)) errors.push(`${module.slug}: presentation differs from imported content`);
    for (const [index, slide] of entry.slides.entries()) {
      if (slide.number !== index + 1 || slide.copy !== `${entry.assetDirectory}/slide-${String(index + 1).padStart(3, "0")}.png` || !/^public\/slides\/(section|appendix)-\d+\/slide-\d+\.png$/.test(slide.copy) || slide.url !== slide.copy.slice(6) || seenCopies.has(slide.copy)) {
        errors.push(`${module.slug}: invalid or duplicate copy path/order`); continue;
      }
      seenCopies.add(slide.copy);
      try {
        const info = pngInfo(path.join(root, slide.copy));
        if (["sha256", "bytes", "width", "height"].some((key) => info[key] !== slide[key])) errors.push(`${slide.copy}: PNG differs from manifest`);
        if (sources && (!slide.original.startsWith(`${sourceDirectory}/`) || slide.original.split("/").includes("..") || sha256(path.join(root, slide.original)) !== slide.sha256)) errors.push(`${slide.copy}: original SHA-256 mismatch`);
      } catch (error) { errors.push(error.message); }
    }
    if (/^public\/slides\/(section|appendix)-\d+$/.test(entry.assetDirectory) && fs.existsSync(path.join(root, entry.assetDirectory))) {
      const expected = entry.slides.map((slide) => path.basename(slide.copy)).sort();
      if (JSON.stringify(fs.readdirSync(path.join(root, entry.assetDirectory)).sort()) !== JSON.stringify(expected)) errors.push(`${entry.assetDirectory}: extra or missing files`);
    } else errors.push(`${module.slug}: invalid/missing asset directory`);
  }
  if (sources) {
    const planned = planImport(root);
    const signature = (entries) => entries.map((entry) => ({ moduleSlug: entry.moduleSlug, slides: entry.slides.map(({ number, original, copy, sha256 }) => ({ number, original, copy, sha256 })) }));
    if (JSON.stringify(signature(planned)) !== JSON.stringify(signature(manifest.presentations))) errors.push("Source inventory differs from manifest; review and reimport.");
  }
  return errors;
}
