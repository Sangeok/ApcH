import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { workflowSteps } from "../../config";

export default function WorkflowSection() {
  return (
    <section className="flex w-full justify-center">
      <div className="space-y-6">
        <Badge variant="secondary" className="w-fit">
          Workflow in three beats
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight">
          Upload, approve, publish. That&apos;s it.
        </h2>
        <div className="space-y-4">
          {workflowSteps.map((step, index) => (
            <div
              key={step.title}
              className="hover:border-primary/50 rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl">
                  {index + 1}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                    {step.title}
                  </p>
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <step.icon className="text-primary size-4" />
                    {step.detail}
                  </div>
                </div>
              </div>
              <p className="text-foreground mt-3 text-base">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
