import { UploadedFileCard } from "./_component/UploadedFileCard";
import type { UploadedFileSummary } from "~/fsd/entities/uploaded-file";

interface UploadedFileListProps {
  files: UploadedFileSummary[];
}

export default function UploadedFileList({ files }: UploadedFileListProps) {
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
        <UploadedFileCard key={file.id} file={file} />
      ))}
    </div>
  );
}
