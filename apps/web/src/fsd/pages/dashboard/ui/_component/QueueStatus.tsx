"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  isOptimisticUploadId,
  UploadedFileStatusBadge,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/fsd/shared/ui/atoms/table";

interface QueueStatusProps {
  uploadedFiles: UploadedFileSummary[];
  isFetching: boolean;
  onRefresh: () => void;
}

export default function QueueStatus({
  uploadedFiles,
  isFetching,
  onRefresh,
}: QueueStatusProps) {
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
          onClick={onRefresh}
          disabled={isFetching}
        >
          {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
              // Optimistic rows use temporary IDs until the server returns a real file ID.
              const isOptimistic = isOptimisticUploadId(file.id);

              return (
                <TableRow className="hover:!bg-transparent" key={file.id}>
                  <TableCell className="max-w-xs truncate font-medium">
                    {file.fileName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(file.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    <UploadedFileStatusBadge status={file.status} />
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
