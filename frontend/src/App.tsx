import * as React from "react";
import { Routes, Route, Navigate, useParams, Link, useNavigate } from "react-router-dom";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { KataView } from "@/components/kata-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getKata, katas } from "@/lib/content";
import { categoryLabel } from "@/lib/categories";
import { useLessonsProgress, Lessons } from "@/lib/lessons";
import { getQueryParam, getRemoteProgress } from "@/lib/skillzengine-bridge";

// Injected by Vite (define) from frontend/package.json.
declare const __APP_VERSION__: string;

function usePersistedBool(key: string, initial: boolean) {
  const [value, setValue] = React.useState<boolean>(() => {
    if (typeof localStorage === "undefined") return initial;
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === "1";
  });
  React.useEffect(() => {
    localStorage.setItem(key, value ? "1" : "0");
  }, [key, value]);
  return [value, setValue] as const;
}

const firstKataId = katas[0]?.id ?? "";

export default function App() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = usePersistedBool("sidebar-collapsed", false);
  const navigate = useNavigate();

  React.useEffect(() => {
    async function syncProgress() {
      // 1. Check if progress clear is requested
      const progress = getQueryParam("se_progress");
      if (progress === "0") {
        console.log("[SkillzEngine App] Clearing local progress as requested by se_progress=0");
        Lessons.reset();
      } else {
        // 2. Fetch remote progress and sync silently
        const remoteCompleted = await getRemoteProgress();
        if (remoteCompleted) {
          console.log("[SkillzEngine App] Syncing remote progress:", remoteCompleted);
          for (const kataId of remoteCompleted) {
            Lessons.complete(kataId, true); // silent = true
          }
        }
      }

      // 3. Handle deep linking
      const seKata = getQueryParam("se_kata");
      if (seKata) {
        console.log("[SkillzEngine App] Deep linking to kata:", seKata);
        navigate(`/kata/${seKata}`, { replace: true });
      }

      // 4. Strip se_ query parameters from the address bar to clean the URL
      const cleanUrl = () => {
        const url = new URL(window.location.href);
        const keysToRemove: string[] = [];
        url.searchParams.forEach((_, key) => {
          if (key.startsWith("se_")) {
            keysToRemove.push(key);
          }
        });
        keysToRemove.forEach((key) => url.searchParams.delete(key));

        // Clear query parameters from hash
        let hash = url.hash;
        const hashQueryStart = hash.indexOf("?");
        if (hashQueryStart !== -1) {
          const hashPath = hash.substring(0, hashQueryStart);
          const hashParams = new URLSearchParams(hash.substring(hashQueryStart));
          const hashKeysToRemove: string[] = [];
          hashParams.forEach((_, key) => {
            if (key.startsWith("se_")) {
              hashKeysToRemove.push(key);
            }
          });
          hashKeysToRemove.forEach((key) => hashParams.delete(key));
          const hashParamStr = hashParams.toString();
          hash = hashPath + (hashParamStr ? "?" + hashParamStr : "");
        }
        url.hash = hash;

        window.history.replaceState({}, "", url.href);
      };

      cleanUrl();
    }

    // Wait for lessons db to be ready before syncing
    void Lessons.ready.then(syncProgress);
  }, [navigate]);

  return (
    <div className={cn("grid min-h-screen grid-cols-1", !collapsed && "md:grid-cols-[264px_minmax(0,1fr)]")}>
      {/* sidebar — sticky on desktop, drawer on mobile, collapsible on desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen border-r border-border bg-[color-mix(in_srgb,var(--background)_92%,var(--foreground)_3%)]",
          !collapsed && "md:block",
        )}
      >
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[280px] border-r border-border bg-background">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] px-6 py-3 backdrop-blur md:px-10">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              aria-pressed={collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <Breadcrumb />
          </div>
          <ThemeToggle />
        </div>

        <Routes>
          <Route path="/" element={firstKataId ? <Navigate to={`/kata/${firstKataId}`} replace /> : <Empty />} />
          <Route path="/kata/:id" element={<KataRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <StatusBar />
    </div>
  );
}

function StatusBar() {
  const year = new Date().getFullYear();
  const { count, total, percent } = useLessonsProgress();
  // Hard reload: bust the document cache with a fresh query param, then navigate.
  // (HashRouter keeps the route in the hash, so the current kata is preserved.)
  const hardReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("r", Date.now().toString(36));
    window.location.replace(url.href);
  };
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-border bg-[color-mix(in_srgb,var(--background)_90%,transparent)] px-4 py-1.5 font-mono text-[11px] text-faint backdrop-blur md:px-6">
      <span>
        <a href="#/" className="text-primary underline-offset-2 hover:underline" title="Back to the catalog home">
          ⌂ Home
        </a>
        <span className="mx-1.5 text-border-strong">·</span>
        © {year} <span className="text-muted-foreground">Algorisys Open Source Team</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <a
          href="https://www.algorisys.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          www.algorisys.com
        </a>
        <span className="mx-1.5 text-border-strong">·</span>
        <a
          href="https://github.com/algorisys-oss/design-patterns-katas"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
          title="Star this project on GitHub"
        >
          ★ GitHub
        </a>
      </span>
      <div className="flex items-center gap-3">
        <span className="tabular-nums" title="Lessons you've completed">
          <span className="text-muted-foreground">{count}</span>/{total} · {percent}%
        </span>
        <span className="text-border-strong">·</span>
        <button
          type="button"
          onClick={hardReload}
          title="Reload the latest version"
          className="tabular-nums transition-colors hover:text-foreground"
        >
          v{__APP_VERSION__}
        </button>
      </div>
    </footer>
  );
}

function KataRoute() {
  const { id } = useParams();
  const kata = id ? getKata(id) : undefined;
  if (!kata) return <NotFound />;
  return <KataView kata={kata} />;
}

function Breadcrumb() {
  const { id } = useParams();
  const kata = id ? getKata(id) : undefined;
  if (!kata) return <span className="font-mono text-[12px] text-faint">Design Patterns</span>;
  return (
    <div className="font-mono text-[12px] text-faint">
      {categoryLabel(kata.category)} / <span className="text-muted-foreground">{kata.title}</span>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-[680px] px-10 py-20 text-center">
      <h1 className="font-serif text-3xl font-semibold">No katas yet</h1>
      <p className="mt-3 text-muted-foreground">Add markdown under <code>content/</code> and run the content build.</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[680px] px-10 py-20 text-center">
      <h1 className="font-serif text-3xl font-semibold">Pattern not found</h1>
      <p className="mt-3 text-muted-foreground">
        That kata doesn't exist yet.{" "}
        <Link to="/" className="text-primary underline underline-offset-2">
          Back to the catalog
        </Link>
        .
      </p>
    </div>
  );
}
