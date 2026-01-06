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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

import Dropzone, { type DropzoneState } from "react-dropzone";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { generateUploadUrl } from "~/actions/s3";
import { processVideo } from "~/actions/generation";
import { toast } from "sonner";

export default function UploadPodcast() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("English");

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const file = files[0]!;
    setUploading(true);

    try {
      // client -> nextjs backend -> s3 bucket
      const { success, signedUrl, uploadedFileId } = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        language: language,
      });

      if (!success) throw new Error("Failed to get upload url");

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload file");

      await processVideo(uploadedFileId, language);

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
      setUploading(false);
    }
  };

  return (
    <div>
      {/* select file or drag and drop the file zone*/}
      <Card>
        <CardHeader>
          <CardTitle>Upload Podcast</CardTitle>
          <CardDescription>
            Upload your audio or video files to get started.
          </CardDescription>
          <CardContent>
            <Dropzone
              onDrop={handleDrop}
              maxSize={500 * 1024 * 1024}
              accept={{
                "video/mp4": [".mp4"],
              }}
              maxFiles={1}
              disabled={uploading}
            >
              {(dropzone: DropzoneState) => (
                <div
                  {...dropzone.getRootProps()}
                  className={cn(
                    "flex flex-col items-center justify-center space-y-4 rounded-lg border border-dashed p-10 text-center transition hover:cursor-pointer hover:bg-gray-200",
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
                    disabled={uploading}
                    className="cursor-pointer"
                  >
                    Select File
                  </Button>
                </div>
              )}
            </Dropzone>
          </CardContent>
        </CardHeader>
      </Card>

      {/* after upload the file, show the following UI */}
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
              <div className="flex gap-x-2">
                <p className="mt-1.5 text-sm font-medium">
                  Select Subtitle Language:
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {language !== "" ? language : "Language"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <DropdownMenuItem
                        onClick={() => setLanguage("English")}
                        className="text-destructive cursor-pointer"
                      >
                        English
                      </DropdownMenuItem>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLanguage("Korean")}
                      className="text-destructive cursor-pointer"
                    >
                      Korean
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>
        <Button
          disabled={files.length === 0 || uploading}
          onClick={handleUpload}
        >
          {uploading ? (
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
