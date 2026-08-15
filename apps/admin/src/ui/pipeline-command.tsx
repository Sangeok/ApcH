"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { postPipelineCommand } from "~/pipeline/command-action";
import type { PipelineCommandKey } from "~/pipeline/commands"; // 타입만(런타임 임포트 없음)
import { Button } from "~/ui/atoms/button";

export function PipelineCommandButton({
  command,
  label,
}: {
  command: PipelineCommandKey;
  label: string;
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
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "요청 중..." : label}
    </Button>
  );
}
