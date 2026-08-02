import { Badge } from "~/fsd/shared/ui/atoms/badge";

interface SeoSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SeoSection({
  eyebrow,
  title,
  description,
  children,
}: SeoSectionProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        {eyebrow ? (
          <Badge variant="secondary" className="w-fit">
            {eyebrow}
          </Badge>
        ) : null}
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground max-w-3xl text-lg">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
