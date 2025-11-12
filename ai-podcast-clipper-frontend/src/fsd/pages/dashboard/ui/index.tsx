"use client";

import type { Clip } from "generated/prisma";
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/fsd/shared/ui/atoms/tabs";

import Dropzone, { type DropzoneState } from "react-dropzone";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { generateUploadUrl } from "~/actions/s3";
import { toast } from "sonner";
import { processVideo } from "~/actions/generation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/fsd/shared/ui/atoms/table";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { useRouter } from "next/navigation";

interface DashboardClientProps {
  uploadedFiles: {
    id: string;
    s3Key: string;
    fileName: string;
    status: string;
    createdAt: Date;
    clipsCount: number;
  }[];
  clips: Clip[];
}

export default function DashboardClient({
  uploadedFiles,
  clips,
}: DashboardClientProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const file = files[0]!;
    setUploading(true);

    try {
      // client -> nextjs backend -> s3 bucket
      const { success, signedUrl, uploadedFileId, key } =
        await generateUploadUrl({
          fileName: file.name,
          contentType: file.type,
        });

      if (!success) throw new Error("Failed to get upload url");
      console.log("signedUrl:", signedUrl);
      console.log("uploadedFileId:", uploadedFileId);

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload file");

      await processVideo(uploadedFileId);

      setFiles([]);

      toast.success("Video uploaded successfully", {
        description:
          "Your video has been scheduled for processing. Check the status below",
        duration: 5000,
      });
    } catch (error) {
      toast.error("Failed to upload video", {
        description:
          "There was a problem uploading your video. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Podcast Clipper
        </h1>
        <p className="text-muted-foreground">
          Upload your podcast files and get AI-generated clips.
        </p>
      </div>
      <Link href="/dashboard/billing">
        <Button>Buy Credits</Button>
      </Link>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my-clips">My Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
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
                        Drag and drop your audio or video files here, or click
                        to browse.
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
          <div className="mt-4 flex items-start justify-between">
            <div>
              {files.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Selected file:</p>
                  {files.map((file) => (
                    <p className="text-muted-foreground" key={file.name}>
                      {file.name}
                    </p>
                  ))}
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
          {uploadedFiles.length > 0 && (
            <div className="pt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-md font-semibold">Qeueu status</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadedFiles.map((file) => (
                      <TableRow key={file.id}>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="my-clips"></TabsContent>
      </Tabs>
    </div>
  );
}
