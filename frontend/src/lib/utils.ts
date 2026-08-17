import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LANG_META: Record<string, { label: string; color: string }> = {
  javascript: { label: "JavaScript", color: "var(--lang-js)" },
  "node-js": { label: "Node.js", color: "var(--lang-node)" },
  python: { label: "Python", color: "var(--lang-python)" },
  elixir: { label: "Elixir", color: "var(--lang-elixir)" },
  go: { label: "Go", color: "var(--lang-go)" },
  java: { label: "Java", color: "var(--lang-java)" },
  csharp: { label: "C#", color: "var(--lang-csharp)" },
  rust: { label: "Rust", color: "var(--lang-rust)" },
  zig: { label: "Zig", color: "var(--lang-zig)" },
};

export function freqDots(freq: string) {
  const level = freq === "high" ? 5 : freq === "low" ? 2 : 3;
  return { on: level, off: 5 - level };
}
