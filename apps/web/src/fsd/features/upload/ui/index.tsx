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
import { useState } from "react";
import {
  isActiveProcessingStatus,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/fsd/shared/ui/atoms/alert-dialog";
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
  // 이 앱에서 가장 파괴적인 액션이라 blocking window.confirm 대신 앱의
  // AlertDialog를 쓴다. 드롭다운 항목이 트리거라 메뉴가 닫히면서 트리거가
  // 사라지므로, 트리거를 두지 않고 열림 상태를 직접 들고 있는다.
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
    setIsDeleteDialogOpen(false);
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
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isActive}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete detail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              The original file and all clips generated from it are deleted.
              This cannot be undone, and spent credits are not refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
