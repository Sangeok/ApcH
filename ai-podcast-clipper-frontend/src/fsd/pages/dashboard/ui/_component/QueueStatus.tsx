"use client";

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
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface QueueStatusProps {
  uploadedFiles: {
    id: string;
    fileName: string;
    createdAt: Date;
    status: string;
    clipsCount: number;
  }[];
}

export default function QueueStatus({ uploadedFiles }: QueueStatusProps) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  return (
    <>
      {uploadedFiles.length > 0 && (
        <div className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-md font-semibold">Queue status</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                  <TableHead>Clips created</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploadedFiles.map((file) => (
                  <TableRow className="hover:!bg-transparent" key={file.id}>
                    <TableCell className="max-w-xs truncate font-medium">
                      {file.fileName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(file.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-medium">
                      {file.status === "queued" && (
                        <Badge variant="outline">Queued</Badge>
                      )}
                      {file.status === "processing" && (
                        <Badge variant="outline">Processing</Badge>
                      )}
                      {file.status === "processed" && (
                        <Badge variant="outline">Processed</Badge>
                      )}
                      {file.status === "failed" && (
                        <Badge variant="destructive">Faileds</Badge>
                      )}
                      {file.status === "failed" && (
                        <Badge variant="destructive">Faileds</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-medium">
                      {file.clipsCount > 0 ? (
                        <span>
                          {file.clipsCount} clip
                          {file.clipsCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          No clips yet
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-medium">
                      <Link href={`/dashboard/uploads/${file.id}`}>
                        <Button variant="outline" size="sm">
                          View details
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}
