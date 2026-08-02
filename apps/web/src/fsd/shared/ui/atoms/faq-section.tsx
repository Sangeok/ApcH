import type { FaqItem } from "~/fsd/shared/lib/seo";

interface FaqSectionProps {
  title?: string;
  items: FaqItem[];
}

export function FaqSection({
  title = "Frequently asked questions",
  items,
}: FaqSectionProps) {
  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      <dl className="space-y-4">
        {items.map((item) => (
          <div
            key={item.question}
            className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
          >
            <dt className="text-foreground font-medium">{item.question}</dt>
            <dd className="text-muted-foreground mt-2 leading-relaxed">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
