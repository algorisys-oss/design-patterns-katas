import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("dpk-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle theme" className="gap-2 font-mono">
      {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{dark ? "Dark" : "Light"}</span>
    </Button>
  );
}
