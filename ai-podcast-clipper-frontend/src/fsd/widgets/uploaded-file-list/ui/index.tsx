import { UploadedFileCard } from "./_component/UploadedFileCard";
import type { UploadedFileSummary } from "../model/types";
import type { ActionResult } from "~/fsd/shared/api/result";

interface UploadedFileListProps {
  files: UploadedFileSummary[];
  fetchPlayUrl: (id: string) => Promise<ActionResult<{ url: string }>>;
}

export default function UploadedFileList({ files, fetchPlayUrl }: UploadedFileListProps) {
  const hasNoFiles = files.length === 0;

  if (hasNoFiles) {
    return (
      <p className="text-muted-foreground text-sm">
        No uploaded files yet. Upload a file to get started.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <UploadedFileCard key={file.id} file={file} fetchPlayUrl={fetchPlayUrl} />
      ))}
    </div>
  );
}
