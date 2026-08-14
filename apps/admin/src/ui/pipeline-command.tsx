"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { postPipelineCommand } from "~/pipeline/command-action";
import { Button } from "~/ui/atoms/button";

export function PipelineCommandButton() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await postPipelineCommand();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Command posted to issue #87");
    });
  };

  return (
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "Posting..." : "Run pipeline"}
    </Button>
  );
}
