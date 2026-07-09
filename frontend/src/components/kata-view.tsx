import { Badge } from "@/components/ui/badge";
import { Implementations } from "@/components/implementations";
import { freqDots } from "@/lib/utils";
import { type Kata } from "@/lib/content";

const CATEGORY_LABEL: Record<string, string> = {
  creational: "Creational",
  structural: "Structural",
  behavioral: "Behavioral",
};

export function KataView({ kata }: { kata: Kata }) {
  const dots = freqDots(kata.frequency);
  return (
    <article className="mx-auto max-w-[760px] px-6 pb-24 pt-8 md:px-10">
      <header className="border-b border-border pb-7">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="category">{CATEGORY_LABEL[kata.category] ?? kata.category}</Badge>
          <Badge className="capitalize">{kata.difficulty}</Badge>
          <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            Frequency
            <span className="tracking-[1px]">
              <span style={{ color: "var(--primary)" }}>{"●".repeat(dots.on)}</span>
              <span style={{ color: "var(--border-strong)" }}>{"●".repeat(dots.off)}</span>
            </span>
            {kata.frequency}
          </span>
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
            <Badge key={t} variant="outline">
              #{t}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}
