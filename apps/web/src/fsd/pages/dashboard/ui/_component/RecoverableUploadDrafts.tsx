"use client";

import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useDeleteUploadedFile } from "~/fsd/features/upload/model/use-delete-uploaded-file";
import { useResumeUploadDraft } from "~/fsd/features/upload/model/use-resume-upload-draft";
import type { RecoverableUploadDraftSummary } from "~/fsd/entities/uploaded-file";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { formatDateTime } from "~/fsd/shared/lib/format-date";
import { toast } from "sonner";

interface RecoverableUploadDraftsProps {
  drafts: RecoverableUploadDraftSummary[];
}

export default function RecoverableUploadDrafts({
  drafts,
}: RecoverableUploadDraftsProps) {
  const router = useRouter();
  // 무효화 정책은 features/upload가 소유한다. router.refresh()는 RSC가 그리는
  // 헤더 크레딧 배지까지 갱신해야 해서 여기 남는다(규약 §8 예외).
  const resumeMutation = useResumeUploadDraft();
  const deleteMutation = useDeleteUploadedFile({
    onDeleted: () => router.refresh(),
  });
  const isPending = resumeMutation.isPending || deleteMutation.isPending;

  if (drafts.length === 0) {
    return null;
  }

  const handleResume = (uploadedFileId: string) => {
    resumeMutation.mutate(uploadedFileId, {
      onSuccess: () => {
        toast.success("Processing resumed");
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleDiscard = (uploadedFileId: string) => {
    deleteMutation.mutate(uploadedFileId, {
      onSuccess: () => {
        toast.success("Upload discarded");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recoverable Uploads</CardTitle>
        <CardDescription>
          Confirmed source uploads that have not entered the processing queue yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="space-y-1">
              <p className="font-medium">{draft.fileName}</p>
              <p className="text-muted-foreground text-sm">
                {draft.targetClipCount} target clip
                {draft.targetClipCount === 1 ? "" : "s"} · {draft.language}
              </p>
              <p className="text-muted-foreground text-sm">
                Uploaded{" "}
                {formatDateTime(draft.sourceUploadedAt ?? draft.createdAt)}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleResume(draft.id)}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Resume processing
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDiscard(draft.id)}
                disabled={isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Discard
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
