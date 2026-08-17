"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/fsd/shared/ui/atoms/button";
import { postPipelineCommand } from "../api/post-pipeline-command";
import type { PipelineCommandKey } from "../model/commands";

export function PipelineCommandButton({
  command,
  label,
  className,
}: {
  command: PipelineCommandKey;
  label: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await postPipelineCommand(command);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("실행 요청을 보냈습니다 (이슈 #87)");
    });
  };

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={className}
    >
      {isPending ? "요청 중..." : label}
    </Button>
  );
}
