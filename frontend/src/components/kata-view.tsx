import * as React from "react";
import { Link } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Implementations } from "@/components/implementations";
import { cn, freqDots } from "@/lib/utils";
import { getAdjacent, type Kata } from "@/lib/content";
import { Lessons, useLessonComplete } from "@/lib/lessons";

const CATEGORY_LABEL: Record<string, string> = {
  foundations: "Foundations",
  creational: "Creational",
  structural: "Structural",
  behavioral: "Behavioral",
};

export function KataView({ kata }: { kata: Kata }) {
  const dots = freqDots(kata.frequency);
  const isPrinciple = kata.kind === "principle";
  const done = useLessonComplete(kata.id);
  const endRef = React.useRef<HTMLDivElement>(null);
  const autoMarked = React.useRef(false);

  // Fresh auto-mark budget whenever the reader opens a different lesson.
  React.useEffect(() => {
    autoMarked.current = false;
  }, [kata.id]);

  // Auto-mark complete once the learner scrolls to the end of the lesson. Only ever
  // marks (never un-marks), and only once per visit, so a manual un-mark sticks.
  React.useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !autoMarked.current) {
        autoMarked.current = true;
        Lessons.complete(kata.id);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [kata.id]);

  return (
    <article className="mx-auto max-w-[760px] px-6 pb-24 pt-8 md:px-10">
      <header className="border-b border-border pb-7">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="category">{CATEGORY_LABEL[kata.category] ?? kata.category}</Badge>
          <Badge className="capitalize">{kata.difficulty}</Badge>
          {isPrinciple ? (
            <span className="ml-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Principle
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              Frequency
              <span className="tracking-[1px]">
                <span style={{ color: "var(--primary)" }}>{"●".repeat(dots.on)}</span>
                <span style={{ color: "var(--border-strong)" }}>{"●".repeat(dots.off)}</span>
              </span>
              {kata.frequency}
            </span>
          )}
          <button
            type="button"
            onClick={() => Lessons.toggle(kata.id)}
            aria-pressed={done}
            title={done ? "Marked complete — click to undo" : "Mark this lesson complete"}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
              done
                ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            {done ? "Completed" : "Mark complete"}
          </button>
        </div>
        <h1 className="font-serif text-[44px] font-semibold leading-[1.05] tracking-[-0.015em] text-balance">
          {kata.title}
        </h1>
        <p className="mt-2.5 max-w-[68ch] text-[19px] leading-[1.5] text-muted-foreground">{kata.intent}</p>
        {(kata.also_known_as.length > 0 || kata.gof) && (
          <div className="mt-3.5 font-mono text-[12px] text-faint">
            {kata.also_known_as.length > 0 && <>Also known as: {kata.also_known_as.join(", ")}</>}
            {kata.also_known_as.length > 0 && kata.gof && " · "}
            {kata.gof && "GoF"}
          </div>
        )}
      </header>

      {kata.blocks.map((block) => (
        <section key={block.id} className="max-w-[68ch]">
          <h2 className="mt-11 flex items-center gap-3 pt-2 text-[14px] font-bold uppercase tracking-[0.02em] text-foreground">
            <span className="h-0.5 w-[22px] flex-none" style={{ background: "var(--primary)" }} aria-hidden />
            {block.title}
          </h2>
          {block.kind === "impl" ? (
            <Implementations block={block} />
          ) : (
            <div className="prose-kata mt-1" dangerouslySetInnerHTML={{ __html: block.html }} />
          )}
        </section>
      ))}

      {kata.tags.length > 0 && (
        <div className="mt-14 flex flex-wrap gap-2 border-t border-border pt-6">
          {kata.tags.map((t) => (
            <Link key={t} to={`?tag=${encodeURIComponent(t)}`} aria-label={`Filter by ${t}`}>
              <Badge
                variant="outline"
                className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
              >
                #{t}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <div ref={endRef} aria-hidden className="h-px" />

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => Lessons.toggle(kata.id)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[14px] font-semibold transition-colors",
            done
              ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          {done ? <Check className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
          {done ? "Lesson completed" : "Mark this lesson complete"}
        </button>
      </div>

      <PrevNext id={kata.id} />
    </article>
  );
}

function PrevNext({ id }: { id: string }) {
  const { prev, next } = getAdjacent(id);
  if (!prev && !next) return null;
  return (
    <nav className="mt-12 grid grid-cols-2 gap-3 border-t border-border pt-6" aria-label="Pattern navigation">
      {prev ? (
        <Link
          to={`/kata/${prev.id}`}
          className="flex flex-col rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">← Previous</span>
          <span className="mt-1 text-[15px] font-semibold text-foreground">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={`/kata/${next.id}`}
          className="flex flex-col items-end rounded-lg border border-border px-4 py-3 text-right transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Next →</span>
          <span className="mt-1 text-[15px] font-semibold text-foreground">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
