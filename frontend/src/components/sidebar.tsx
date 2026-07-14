import * as React from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { Search, X, ChevronRight, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupByCategory, searchKatas, type Kata } from "@/lib/content";
import { categoryLabel, categoryMeta, type CategoryTrack } from "@/lib/categories";
import { useLessonComplete, useLessonsProgress } from "@/lib/lessons";

// Super-groups the category list into tracks in the sidebar.
const TRACK_LABEL: Record<CategoryTrack, string> = {
  foundations: "Principles",
  gof: "Gang of Four",
  modern: "Modern Patterns",
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = React.useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get("tag");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const results = React.useMemo(
    () => searchKatas(query, activeTag ? [activeTag] : []),
    [query, activeTag],
  );
  const groups = groupByCategory(results);
  const total = results.length;
  // When filtering, keep every group open so matches are always visible.
  const filtering = query.trim().length > 0 || Boolean(activeTag);

  const clearTag = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("tag");
    setSearchParams(next, { replace: true });
  };

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

      <SidebarProgress />

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

      {activeTag && (
        <div className="px-4 pb-2">
          <button
            onClick={clearTag}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-primary/20"
          >
            #{activeTag}
            <X className="h-3 w-3" aria-hidden />
            <span className="sr-only">Clear tag filter</span>
          </button>
        </div>
      )}

      <nav className="thin-scroll flex-1 overflow-y-auto px-2 pb-10">
        {total === 0 && (
          <p className="px-3 py-6 font-mono text-[12px] text-faint">
            No patterns match {activeTag ? `#${activeTag}` : `“${query}”`}.
          </p>
        )}
        {groups.map(([category, items], idx) => {
          const isCollapsed = !filtering && collapsed[category];
          const track = categoryMeta(category)?.track;
          const prevTrack = idx > 0 ? categoryMeta(groups[idx - 1][0])?.track : undefined;
          const showTrack = track && track !== prevTrack;
          return (
            <React.Fragment key={category}>
              {showTrack && (
                <div className="mt-5 mb-1 flex items-center gap-2 px-3 first:mt-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80">
                    {TRACK_LABEL[track]}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </div>
              )}
              <div className="mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1 px-3 pb-1.5 pt-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-faint transition-colors hover:text-foreground"
              >
                <ChevronRight
                  className={cn("h-3 w-3 flex-none transition-transform", !isCollapsed && "rotate-90")}
                  aria-hidden
                />
                {categoryLabel(category)}
                <span className="ml-auto tabular-nums text-faint/70">{items.length}</span>
              </button>
                {!isCollapsed && (
                  <ul>
                    {items.map((k) => (
                      <SidebarLink key={k.id} kata={k} onNavigate={onNavigate} />
                    ))}
                  </ul>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarLink({ kata, onNavigate }: { kata: Kata; onNavigate?: () => void }) {
  const done = useLessonComplete(kata.id);
  return (
    <li>
      <NavLink
        to={`/kata/${kata.id}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[14px] text-muted-foreground transition-colors",
            "hover:bg-primary/10 hover:text-foreground",
            isActive && "bg-primary/15 font-semibold text-foreground",
          )
        }
      >
        <span className="min-w-[16px] font-mono text-[11px] text-faint">
          {String(kata.sequence).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate">{kata.title}</span>
        {done && (
          <Check className="h-3.5 w-3.5 flex-none text-green-500" aria-label="Completed" />
        )}
      </NavLink>
    </li>
  );
}

function SidebarProgress() {
  const { count, total, percent } = useLessonsProgress();
  return (
    <div className="px-4 pb-1 pt-3">
      <div className="mb-1 flex items-center justify-between font-mono text-[10.5px] text-faint">
        <span className="uppercase tracking-[0.1em]">Progress</span>
        <span className="tabular-nums text-muted-foreground">
          {count} / {total} · {percent}%
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Lessons completed"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
