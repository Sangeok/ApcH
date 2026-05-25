"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Clip } from "generated/prisma";
import {
  Copy,
  Download,
  FileText,
  Hash,
  Loader2,
  Lock,
  MoreHorizontal,
  Trash,
} from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
import type { ActionResult } from "~/fsd/shared/api/result";
import { triggerDownload } from "~/fsd/shared/lib/triggerDownload";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

interface ClipActionsProps {
  clip: Clip;
  playUrl: string | null;
  isLoading: boolean;
  hasScript: boolean;
  hasMetadata: boolean;
  allowDelete: boolean;
  onOpenScript: () => void;
  onOpenMetadata: () => void;
  onCopyScript: () => void | Promise<void>;
  onDelete: (clipId: string) => Promise<ActionResult<void>>;
  onDeleteSuccess: (clipId: string) => void;
}

export function ClipActions({
  clip,
  playUrl,
  isLoading,
  hasScript,
  hasMetadata,
  allowDelete,
  onOpenScript,
  onOpenMetadata,
  onCopyScript,
  onDelete,
  onDeleteSuccess,
}: ClipActionsProps) {
  const queryClient = useQueryClient();
  const [isDeleting, startDeleting] = useTransition();

  const handleDownload = () => {
    if (!playUrl) return;
    triggerDownload(playUrl);
  };

  const handleDelete = () => {
    if (!allowDelete) {
      toast.error("Visible clips cannot be deleted");
      return;
    }

    startDeleting(async () => {
      const result = await onDelete(clip.id);

      if (result.success) {
        const uploadedFileId = clip.uploadedFileId;

        if (uploadedFileId) {
          queryClient.setQueryData<UploadedFileDetail>(
            uploadedFileKeys.detail(uploadedFileId),
            (old) =>
              old
                ? {
                    ...old,
                    clips: old.clips.filter((item) => item.id !== clip.id),
                  }
                : old,
          );
        }

        onDeleteSuccess(clip.id);

        await Promise.all([
          uploadedFileId
            ? queryClient.invalidateQueries({
                queryKey: uploadedFileKeys.detail(uploadedFileId),
              })
            : Promise.resolve(),
          queryClient.invalidateQueries({
            queryKey: uploadedFileKeys.lists(),
          }),
        ]);

        toast.success("Clip deleted");
      } else {
        toast.error(result.error ?? "Failed to delete clip");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={handleDownload}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!playUrl || isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Download
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="More actions"
              disabled={isDeleting}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpenScript} className="cursor-pointer">
              <FileText className="mr-2 h-4 w-4" />
              Script
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenMetadata}
              disabled={!hasMetadata}
              className="cursor-pointer"
            >
              <Hash className="mr-2 h-4 w-4" />
              YouTube Metadata
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onCopyScript}
              disabled={!hasScript}
              className="cursor-pointer"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy script
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isDeleting || !allowDelete}
              variant="destructive"
              className="cursor-pointer"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : allowDelete ? (
                <Trash className="mr-2 h-4 w-4" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {allowDelete ? "Delete" : "Delete disabled"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
