"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

import Dropzone, { type DropzoneState } from "react-dropzone";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useUploadPodcast } from "~/fsd/pages/dashboard/model/useUploadPodcast";
import {
  UPLOAD_CONFIG,
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_CLIP_COUNT,
} from "~/fsd/shared/config/constants";
import type { UploadedFileSummary } from "../../model/types";

interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
}

export default function UploadPodcast({ onOptimisticAdd }: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);
  const { upload, isUploading } = useUploadPodcast({
    onOptimisticAdd,
    onSuccess: () => setFiles([]),
  });

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = () => {
    const file = files[0];
    if (!file) return;
    upload(file, language, clipCount);
  };

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Upload Podcast</CardTitle>
          <CardDescription>
            Upload your audio or video files to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dropzone
            onDrop={handleFileDrop}
            maxSize={UPLOAD_CONFIG.MAX_FILE_SIZE}
            accept={UPLOAD_CONFIG.ACCEPTED_TYPES}
            maxFiles={1}
            disabled={isUploading}
          >
            {(dropzone: DropzoneState) => (
              <div
                {...dropzone.getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center space-y-4 rounded-lg border border-dashed p-10 text-center transition hover:cursor-pointer hover:bg-muted",
                )}
              >
                <input {...dropzone.getInputProps()} />
                <UploadCloud className="text-muted-foreground h-12 w-12" />
                <p className="font-medium">
                  Drag and drop your audio or video files here, or click to
                  browse.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isUploading}
                  className="cursor-pointer"
                >
                  Select File
                </Button>
              </div>
            )}
          </Dropzone>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-start justify-between">
        <div className="flex">
          {files.length > 0 && (
            <div className="flex flex-col gap-y-4">
              <div className="flex space-y-1 gap-x-2 text-sm">
                <p className="font-medium">Selected file:</p>
                {files.map((file) => (
                  <p className="text-muted-foreground" key={file.name}>
                    {file.name}
                  </p>
                ))}
              </div>
              <div className="flex gap-x-4">
                <div className="flex gap-x-2">
                  <p className="mt-1.5 text-sm font-medium">
                    Select Subtitle Language:
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        {language}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <DropdownMenuItem
                          key={lang.value}
                          onClick={() => setLanguage(lang.value)}
                          className="cursor-pointer"
                        >
                          {lang.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex gap-x-2">
                  <p className="mt-1.5 text-sm font-medium">Number of Clips:</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        {clipCount} {clipCount === 1 ? "clip" : "clips"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {CLIP_COUNT_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => setClipCount(option.value)}
                          className="cursor-pointer"
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          )}
        </div>
        <Button
          disabled={files.length === 0 || isUploading}
          onClick={handleUpload}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            "Upload and Generate Clips"
          )}
        </Button>
      </div>
    </div>
  );
}
