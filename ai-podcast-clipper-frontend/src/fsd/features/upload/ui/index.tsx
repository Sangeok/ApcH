"use client";

import { Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import { isActiveProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import type { ActionResult } from "~/fsd/shared/api/result";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";
import { toast } from "sonner";
import { deleteUploadedFileWithClips } from "../api";
import { useReprocessUploadedFile } from "../model/use-reprocess-uploaded-file";

type RunOptions = {
  action: () => Promise<ActionResult<void>>;
  successMessage: string;
  confirmationMessage?: string;
  onSuccess?: () => void;
  startTransition: ReturnType<typeof useTransition>[1];
};

const runAction = ({
  action,
  successMessage,
  confirmationMessage,
  onSuccess,
  startTransition,
}: RunOptions) => {
  if (confirmationMessage && !confirm(confirmationMessage)) {
    return;
  }

  startTransition(async () => {
    const result = await action();

    if (!result.success) {
      toast.error(result.error ?? "Request failed");
      return;
    }

    toast.success(successMessage);
    onSuccess?.();
  });
};

interface UploadedFileActionsProps {
  uploadedFileId: string;
  status: ProcessingStatus;
}

export default function UploadedFileActions({
  uploadedFileId,
  status,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const reprocessMutation = useReprocessUploadedFile(uploadedFileId);
  const [isDeleting, startDeleteTransition] = useTransition();
  const isActive = isActiveProcessingStatus(status);
  const anyPending = reprocessMutation.isPending || isDeleting;

  const handleReprocess = () => {
    reprocessMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Reprocessing started");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleDelete = () => {
    runAction({
      action: () => deleteUploadedFileWithClips(uploadedFileId),
      successMessage: "Original file and clips deleted",
      confirmationMessage:
        "Are you sure you want to delete the file and all associated clips?",
      onSuccess: () => router.push("/dashboard"),
      startTransition: startDeleteTransition,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={anyPending || isActive}
        onClick={handleReprocess}
      >
        {reprocessMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Reprocess
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" disabled={anyPending || isActive}>
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="mr-2 h-4 w-4" />
            )}
            Manage
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
            onClick={handleDelete}
            disabled={isActive}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
