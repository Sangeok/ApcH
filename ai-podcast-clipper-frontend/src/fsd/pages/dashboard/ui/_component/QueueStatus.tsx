"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import {
  isActiveProcessingStatus,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file/model/processing-status";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/fsd/shared/ui/atoms/table";
import { STATUS_CONFIG } from "../../config";
import type { UploadedFileSummary } from "../../model/types";

interface QueueStatusProps {
  uploadedFiles: UploadedFileSummary[];
}

function StatusBadge({ status }: { status: ProcessingStatus }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function QueueStatus({ uploadedFiles }: QueueStatusProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const hasActiveUpload = uploadedFiles.some((file) =>
    isActiveProcessingStatus(file.status),
  );

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  useEffect(() => {
    if (!hasActiveUpload) {
      return;
    }

    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 7_500);

    return () => window.clearInterval(intervalId);
  }, [hasActiveUpload, router, startTransition]);

  if (uploadedFiles.length === 0) {
    return null;
  }

  return (
    <div className="pt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-md font-semibold">Queue status</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Refresh
        </Button>
      </div>
      <div className="max-h-[300px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Processed</TableHead>
              <TableHead>Visible clips</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploadedFiles.map((file) => {
              const isOptimistic = file.id.startsWith("optimistic-");

              return (
                <TableRow className="hover:!bg-transparent" key={file.id}>
                  <TableCell className="max-w-xs truncate font-medium">
                    {file.fileName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(file.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    <StatusBadge status={file.status} />
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    {file.visibleClipsCount > 0 ? (
                      <span>
                        {file.visibleClipsCount} clip
                        {file.visibleClipsCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No clips yet
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    {isOptimistic ? (
                      <Button variant="outline" size="sm" disabled>
                        View details
                      </Button>
                    ) : (
                      <Link href={`/dashboard/uploads/${file.id}`}>
                        <Button variant="outline" size="sm">
                          View details
                        </Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
