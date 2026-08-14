import type { BoardSection } from "~/pipeline/board";
import { Badge } from "~/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/ui/atoms/card";
import { PipelineCommandButton } from "~/ui/pipeline-command";

// 없는 status는 "default". 완료=secondary(muted), 보류=destructive(red).
const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  완료: "secondary",
  보류: "destructive",
};

export function PipelineBoard({ sections }: { sections: BoardSection[] }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PROJECT_BOARD.md (dev) 투영 — 상태를 저장하지 않습니다.
          </p>
        </div>
        <PipelineCommandButton />
      </div>

      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {section.heading}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {section.items.map((item) => (
              <Card key={`${section.heading}:${item.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{item.id}</CardTitle>
                    {item.status && (
                      <Badge
                        variant={STATUS_BADGE_VARIANT[item.status] ?? "default"}
                      >
                        {item.status}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{item.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {item.agent && <p>agent: {item.agent}</p>}
                  {item.area && <p>area: {item.area}</p>}
                  {item.result ? (
                    <p className="text-foreground">결과: {item.result}</p>
                  ) : (
                    item.reason && <p>근거: {item.reason}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
