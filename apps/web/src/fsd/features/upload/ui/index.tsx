"use client";

import {
  CreditCard,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isActiveProcessingStatus,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";
import { toast } from "sonner";
import { useDeleteUploadedFile } from "../model/use-delete-uploaded-file";
import { useReprocessUploadedFile } from "../model/use-reprocess-uploaded-file";

interface UploadedFileActionsProps {
  uploadedFileId: string;
  status: ProcessingStatus;
  currentUserCredits: number;
}

export default function UploadedFileActions({
  uploadedFileId,
  status,
  currentUserCredits,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const reprocessMutation = useReprocessUploadedFile(uploadedFileId);
  // 캐시 정책은 feature model 훅이 소유한다. 여기서는 사용자 상호작용만 다룬다.
  const deleteMutation = useDeleteUploadedFile({
    onDeleted: () => router.push("/dashboard"),
  });
  const isActive = isActiveProcessingStatus(status);
  const isAnyActionPending =
    reprocessMutation.isPending || deleteMutation.isPending;
  const shouldBuyCredits = status === "no credits" && currentUserCredits <= 0;
  const actionLabel =
    status === "failed" || (status === "no credits" && currentUserCredits > 0)
      ? "Retry processing"
      : "Reprocess";

  const handleReprocess = () => {
    reprocessMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Processing started");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleDelete = () => {
    // TODO(C-71): shared/ui/atoms/alert-dialog로 교체한다.
    if (
      !confirm(
        "Are you sure you want to delete the file and all associated clips?",
      )
    ) {
      return;
    }

    deleteMutation.mutate(uploadedFileId, {
      onSuccess: () => {
        toast.success("Original file and clips deleted");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      {shouldBuyCredits ? (
        <Button variant="outline" disabled={isAnyActionPending} asChild>
          <Link href="/dashboard/billing">
            <CreditCard className="mr-2 h-4 w-4" />
            Buy credits
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={isAnyActionPending || isActive}
          onClick={handleReprocess}
        >
          {reprocessMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {actionLabel}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" disabled={isAnyActionPending || isActive}>
            {deleteMutation.isPending ? (
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
