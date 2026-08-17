import { cn } from "~/fsd/shared/lib/utils";
import { identityFor, initialOf } from "../../model/known-agents";

const DIM = {
  sm: "size-8 text-sm",
  md: "size-9 text-base",
  lg: "size-10 text-lg",
} as const;

export function AgentAvatar({
  agentId,
  size = "md",
}: {
  agentId: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const identity = identityFor(agentId);
  return (
    <span
      role="img"
      aria-label={identity.handle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted",
        DIM[size],
      )}
    >
      {identity.emoji || initialOf(identity)}
    </span>
  );
}
