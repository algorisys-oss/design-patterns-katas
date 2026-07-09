import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LANG_META: Record<string, { label: string; color: string }> = {
  javascript: { label: "JavaScript", color: "var(--lang-js)" },
  python: { label: "Python", color: "var(--lang-python)" },
  elixir: { label: "Elixir", color: "var(--lang-elixir)" },
  go: { label: "Go", color: "var(--lang-go)" },
};

export function freqDots(freq: string) {
  const level = freq === "high" ? 5 : freq === "low" ? 2 : 3;
  return { on: level, off: 5 - level };
}
