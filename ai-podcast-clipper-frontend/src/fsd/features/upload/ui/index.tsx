"use client";

import { useTransition } from "react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";
import { toast } from "sonner";
import {
  deleteUploadedFileWithClips,
  reprocessUploadedFile,
} from "~/fsd/features/upload/api";
import { Loader2, Trash2, RefreshCw, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "~/fsd/shared/api/result";

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
}

export default function UploadedFileActions({
  uploadedFileId,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const [isReprocessing, startReprocessTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const anyPending = isReprocessing || isDeleting;

  const handleReprocess = () => {
    runAction({
      action: () => reprocessUploadedFile(uploadedFileId),
      successMessage: "Reprocessing started",
      onSuccess: () => router.push("/dashboard"),
      startTransition: startReprocessTransition,
    });
  };

  const handleDelete = () => {
    runAction({
      action: () => deleteUploadedFileWithClips(uploadedFileId),
      successMessage: "Original File and clips deleted",
      confirmationMessage:
        "Are you sure you want to delete the file and all associated clips?",
      onSuccess: () => router.push("/dashboard"),
      startTransition: startDeleteTransition,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" disabled={anyPending} onClick={handleReprocess}>
        {isReprocessing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Reprocess
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" disabled={anyPending}>
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
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
