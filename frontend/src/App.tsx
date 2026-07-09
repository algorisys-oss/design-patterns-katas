import * as React from "react";
import { Routes, Route, Navigate, useParams, Link } from "react-router-dom";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { KataView } from "@/components/kata-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getKata, katas } from "@/lib/content";

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

const CATEGORY_LABEL: Record<string, string> = {
  foundations: "Foundations",
  creational: "Creational",
  structural: "Structural",
  behavioral: "Behavioral",
};

const firstKataId = katas[0]?.id ?? "";

export default function App() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = usePersistedBool("sidebar-collapsed", false);

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
    </div>
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
      {CATEGORY_LABEL[kata.category] ?? kata.category} / <span className="text-muted-foreground">{kata.title}</span>
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
