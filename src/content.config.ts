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
    title: z.string().trim().min(1),
    moduleSlug: z.string().trim().min(1),
    draft: z.boolean().default(false),
    questions: z
      .array(
        z.object({
          type: z.literal("single"),
          text: z.string().min(1).refine((text) => text.trim().length > 0),
          options: z.array(z.string().min(1).refine((text) => text.trim().length > 0)).min(2),
          answer: z.number().int().min(1),
          explanation: z.string().optional(),
          source: z.string().optional()
        }).strict().refine((question) => question.answer <= question.options.length, {
          message: "answer must be within options (1-based)",
          path: ["answer"]
        })
      )
      .min(1)
  }).strict()
});

const stories = defineCollection({
  loader: glob({ base: "./src/content/modules", pattern: "**/story.md" }),
  schema: z.object({})
});

const simple = defineCollection({
  loader: glob({ base: "./src/content/modules", pattern: "**/simple.md" }),
  schema: z.object({})
});

export const collections = { modules, presentations, quizzes, stories, simple };
