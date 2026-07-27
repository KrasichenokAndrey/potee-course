import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const modules = defineCollection({
  loader: glob({ base: "./src/content/modules", pattern: "**/module.md" }),
  schema: z.object({
    title: z.string(),
    number: z.string(),
    order: z.number(),
    kind: z.enum(["rule", "appendix"]),
    sourceFile: z.string()
  })
});

const presentations = defineCollection({
  loader: glob({ base: "./src/content/modules", pattern: "**/presentation.md" }),
  schema: z.object({
    title: z.string(),
    moduleSlug: z.string(),
    draft: z.boolean().default(false)
  })
});

const quizzes = defineCollection({
  loader: glob({ base: "./src/content/modules", pattern: "**/quiz.yaml" }),
  schema: z.object({
    title: z.string(),
    moduleSlug: z.string(),
    draft: z.boolean().default(false),
    questions: z
      .array(
        z.object({
          type: z.literal("single"),
          text: z.string(),
          options: z.array(z.string()).min(2),
          answer: z.number().int().min(1),
          explanation: z.string(),
          source: z.string().optional()
        })
      )
      .default([])
  })
});

export const collections = { modules, presentations, quizzes };
