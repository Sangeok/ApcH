"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteUploadedFile,
  requestProcessingAttempt,
} from "~/fsd/features/upload/api";
import type { RecoverableUploadDraftSummary } from "~/fsd/entities/uploaded-file/model/types";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { toast } from "sonner";

interface RecoverableUploadDraftsProps {
  drafts: RecoverableUploadDraftSummary[];
}

const formatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function RecoverableUploadDrafts({
  drafts,
}: RecoverableUploadDraftsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (drafts.length === 0) {
    return null;
  }

  const handleResume = (uploadedFileId: string) => {
    startTransition(async () => {
      const result = await requestProcessingAttempt(uploadedFileId);

      if (!result.success) {
        toast.error(result.error ?? "Failed to resume processing");
        return;
      }

      toast.success("Processing resumed");
      router.refresh();
    });
  };

  const handleDiscard = (uploadedFileId: string) => {
    startTransition(async () => {
      const result = await deleteUploadedFile(uploadedFileId);

      if (!result.success) {
        toast.error(result.error ?? "Failed to discard upload");
        return;
      }

      toast.success("Upload discarded");
      router.refresh();
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
                {formatter.format(
                  new Date(draft.sourceUploadedAt ?? draft.createdAt),
                )}
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
