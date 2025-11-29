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
} from "~/actions/uploaded-files";
import { Loader2, Trash2, RefreshCw, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

interface UploadedFileActionsProps {
  uploadedFileId: string;
}

export default function UploadedFileActions({
  uploadedFileId,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
    confirmationMessage?: string,
  ) => {
    startTransition(async () => {
      if (confirmationMessage) {
        const confirmed = confirm(confirmationMessage);
        if (!confirmed) {
          return;
        }
      }

      const { success, error } = await action();
      if (!success) {
        toast.error(error ?? "Request failed");
        return;
      }
      toast.success(successMessage);
      router.push("/dashboard");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() =>
          run(
            () => reprocessUploadedFile(uploadedFileId),
            "Reprocessing started",
          )
        }
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Reprocess
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" disabled={isPending}>
            {isPending ? (
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
            onClick={() =>
              run(
                () => deleteUploadedFileWithClips(uploadedFileId),
                "Original File and clips deleted",
                "Are you sure you want to delete the file and all associated clips?",
              )
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
