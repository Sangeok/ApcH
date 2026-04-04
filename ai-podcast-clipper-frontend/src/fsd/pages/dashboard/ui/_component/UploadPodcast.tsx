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
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";
import { toast } from "sonner";
import {
  UPLOAD_CONFIG,
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_CLIP_COUNT,
} from "~/fsd/shared/config/constants";

async function uploadFileToS3(file: File, signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error("Failed to upload file to S3");
}

export default function UploadPodcast() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    const file = files[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const uploadResult = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        language: language,
      });

      if (!uploadResult.success) {
        toast.error(uploadResult.error);
        return;
      }

      const { signedUrl, uploadedFileId } = uploadResult.data;

      await uploadFileToS3(file, signedUrl);

      const processResult = await processVideo(uploadedFileId, language, clipCount);

      if (!processResult.success) {
        toast.error(processResult.error);
        return;
      }

      setFiles([]);

      toast.success("Video uploaded successfully", {
        description:
          "Your video has been scheduled for processing. Check the status below",
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to upload video", error);
      toast.error("Failed to upload video", {
        description:
          "There was a problem uploading your video. Please try again.",
      });
    } finally {
      setIsUploading(false);
    }
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
