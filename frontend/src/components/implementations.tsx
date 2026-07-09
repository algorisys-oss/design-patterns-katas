import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LANG_META } from "@/lib/utils";
import type { Block } from "@/lib/content";

type ImplBlock = Extract<Block, { kind: "impl" }>;

export function Implementations({ block }: { block: ImplBlock }) {
  const langs = block.langs;
  const [active, setActive] = React.useState(langs[0]?.slug ?? "");
  const activeColor = LANG_META[active]?.color ?? "var(--primary)";

  if (langs.length === 0) return null;

  return (
    <div style={{ ["--lang" as string]: activeColor }}>
      {block.intro_html && (
        <div className="prose-kata mb-4" dangerouslySetInnerHTML={{ __html: block.intro_html }} />
      )}
      <Tabs value={active} onValueChange={setActive}>
        <TabsList>
          {langs.map((l) => {
            const meta = LANG_META[l.slug];
            const color = meta?.color ?? "var(--primary)";
            return (
              <TabsTrigger
                key={l.slug}
                value={l.slug}
                style={
                  active === l.slug
                    ? ({ borderBottomColor: color, color: "var(--foreground)" } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
                {meta?.label ?? l.name}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {langs.map((l) => (
          <TabsContent key={l.slug} value={l.slug} className="pt-4">
            <div className="prose-kata" dangerouslySetInnerHTML={{ __html: l.html }} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
