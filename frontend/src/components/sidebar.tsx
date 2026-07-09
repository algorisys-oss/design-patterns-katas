import * as React from "react";
import { NavLink } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupByCategory, searchKatas, type Kata } from "@/lib/content";

const CATEGORY_LABEL: Record<string, string> = {
  foundations: "Foundations",
  creational: "Creational",
  structural: "Structural",
  behavioral: "Behavioral",
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = React.useState("");
  const results = React.useMemo(() => searchKatas(query, []), [query]);
  const groups = groupByCategory(results);
  const total = results.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-primary font-serif text-[15px] font-bold text-primary-foreground">
          ◆
        </span>
        <div className="leading-tight">
          <div className="text-[14.5px] font-semibold tracking-tight">Design Patterns Katas</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">JS · Python · Elixir · Go</div>
        </div>
      </div>

      <div className="relative px-4 pb-3 pt-4">
        <Search className="pointer-events-none absolute left-[26px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patterns, tags…"
          className="pl-8 pr-8 font-mono text-[13px]"
          aria-label="Search katas"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-[26px] top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <nav className="thin-scroll flex-1 overflow-y-auto px-2 pb-10">
        {total === 0 && (
          <p className="px-3 py-6 font-mono text-[12px] text-faint">No patterns match “{query}”.</p>
        )}
        {groups.map(([category, items]) => (
          <div key={category} className="mb-1">
            <h4 className="px-3 pb-1.5 pt-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-faint">
              {CATEGORY_LABEL[category] ?? category}
            </h4>
            <ul>
              {items.map((k) => (
                <SidebarLink key={k.id} kata={k} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({ kata, onNavigate }: { kata: Kata; onNavigate?: () => void }) {
  return (
    <li>
      <NavLink
        to={`/kata/${kata.id}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-baseline gap-2.5 rounded-md px-3 py-1.5 text-[14px] text-muted-foreground transition-colors",
            "hover:bg-primary/10 hover:text-foreground",
            isActive && "bg-primary/15 font-semibold text-foreground",
          )
        }
      >
        <span className="min-w-[16px] font-mono text-[11px] text-faint">
          {String(kata.sequence).padStart(2, "0")}
        </span>
        {kata.title}
      </NavLink>
    </li>
  );
}
