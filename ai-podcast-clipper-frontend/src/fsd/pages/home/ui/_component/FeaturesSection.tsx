import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { coreFeatures } from "../../config";

export default function FeaturesSection() {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <Badge variant="secondary" className="w-fit">
          Built for modern creator teams
        </Badge>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">
            Everything you need to ship clips that feel handcrafted.
          </h2>
          <p className="text-muted-foreground max-w-3xl text-lg">
            Replace five tabs and countless revision threads. Podcast
            Clipper pairs narrative intelligence with production-ready
            outputs.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {coreFeatures.map((feature) => (
          <Card key={feature.title} className="h-full px-2 py-4">
            <CardHeader className="space-y-3">
              <div className="text-primary flex items-center gap-3">
                <feature.icon className="size-5" />
                {feature.badge && (
                  <Badge variant="outline" className="text-xs uppercase">
                    {feature.badge}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg">{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {feature.footnote}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
