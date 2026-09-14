import { fileURLToPath } from "node:url";
import { validatePresentations } from "./lib/presentations.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--sources")) throw new Error("Usage: node scripts/validate-presentations.mjs [--sources]");
const errors = validatePresentations(fileURLToPath(new URL("../", import.meta.url)), { sources: args.includes("--sources") });
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Presentation paths, order, draft state and PNG hashes validated${args.includes("--sources") ? " against originals" : ""}.`);
