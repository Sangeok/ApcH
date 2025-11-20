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
  deleteUploadedFile,
  deleteUploadedFileWithClips,
  reprocessUploadedFile,
} from "~/actions/uploaded-files";
import { Loader2, Trash2, RefreshCw, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

interface UploadedFileActionsProps {
  uploadedFileId: string;
  hasClips: boolean;
}

export default function UploadedFileActions({
  uploadedFileId,
  hasClips,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const { success, error } = await action();
      if (!success) {
        toast.error(error ?? "요청을 처리하지 못했습니다.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
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
            "재처리를 시작했습니다.",
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
                () => deleteUploadedFile(uploadedFileId),
                "업로드를 삭제했습니다.",
              )
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete file only
          </DropdownMenuItem>
          {hasClips && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() =>
                run(
                  () => deleteUploadedFileWithClips(uploadedFileId),
                  "파일과 클립을 모두 삭제했습니다.",
                )
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete file + clips
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
