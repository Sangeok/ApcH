"use client";

import type { Clip } from "@repo/db";
import {
  Copy,
  Download,
  FileText,
  Hash,
  Loader2,
  MoreHorizontal,
  Trash,
} from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { useDeleteClip } from "~/fsd/features/clip";
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
  onOpenScript: () => void;
  onOpenMetadata: () => void;
  onCopyScript: () => void | Promise<void>;
  /** 낙관적 제거. 부모의 useOptimistic 리듀서라 부모가 소유한다. */
  onOptimisticRemove: (clipId: string) => void;
}

export function ClipActions({
  clip,
  playUrl,
  isLoading,
  hasScript,
  hasMetadata,
  onOpenScript,
  onOpenMetadata,
  onCopyScript,
  onOptimisticRemove,
}: ClipActionsProps) {
  const deleteMutation = useDeleteClip(clip.uploadedFileId);
  const [isDeleting, startDeleting] = useTransition();

  const handleDownload = () => {
    if (!playUrl) return;
    triggerDownload(playUrl);
  };

  const handleDelete = () => {
    startDeleting(async () => {
      // 서버 응답 **전에** 지운다. 이전에는 확인 뒤에 호출해서 이름과 달리
      // 낙관적이지 않았고, 삭제한 카드가 왕복이 끝날 때까지 남아 있었다.
      // transition이 await 동안 열려 있어야 useOptimistic 값이 유지된다.
      onOptimisticRemove(clip.id);

      try {
        await deleteMutation.mutateAsync(clip.id);
        toast.success("Clip deleted");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete clip",
        );
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
              disabled={isDeleting}
              variant="destructive"
              className="cursor-pointer"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash className="mr-2 h-4 w-4" />
              )}
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
