import { UploadedFileCard } from "./_component/UploadedFileCard";

interface UploadedFileListProps {
  files: {
    id: string;
    fileName: string;
    status: string;
    createdAt: Date;
    clipsCount: number;
  }[];
}

export default function UploadedFileList({ files }: UploadedFileListProps) {
  if (files.length === 0) {
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
