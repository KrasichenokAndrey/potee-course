import type { CollectionEntry } from "astro:content";
import { getCollection, getEntry } from "astro:content";

export type CourseModule = CollectionEntry<"modules">;
export type CoursePresentation = CollectionEntry<"presentations">;
export type CourseQuiz = CollectionEntry<"quizzes">;
export type CourseStory = CollectionEntry<"stories">;
export type CourseSimple = CollectionEntry<"simple">;

export function getSlugFromEntryId(id: string) {
  return id.split("/")[0];
}

export async function getCourseModules() {
  const modules = await getCollection("modules");
  return modules.sort((a, b) => a.data.order - b.data.order);
}

export async function getModuleBySlug(slug: string) {
  return getEntry("modules", `${slug}/module`);
}

export async function getPresentationBySlug(slug: string) {
  return getEntry("presentations", `${slug}/presentation`);
}

export async function getQuizBySlug(slug: string) {
  return getEntry("quizzes", `${slug}/quiz`);
}

export async function getStoryBySlug(slug: string) {
  return getEntry("stories", slug);
}

export async function getSimpleBySlug(slug: string) {
  return getEntry("simple", slug);
}
