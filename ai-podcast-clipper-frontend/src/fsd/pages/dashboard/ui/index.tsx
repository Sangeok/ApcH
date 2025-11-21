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
import QueueStatus from "./_component/QueueStatus";
import UploadPodcast from "./_component/UploadPodcast";
import UploadedFileList from "~/fsd/widgets/uploaded-file-list/ui";

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
}: DashboardClientProps) {
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
      <div className="flex justify-end">
        <Link href="/dashboard/billing">
          <Button>Buy Credits</Button>
        </Link>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my-clips">My Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <UploadPodcast />
          <QueueStatus uploadedFiles={uploadedFiles} />
        </TabsContent>

        <TabsContent value="my-clips">
          <Card>
            <CardHeader>
              <CardTitle>My Clips</CardTitle>
              <CardDescription>
                View and manage your generated clips. Processing may take a few
                minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadedFileList files={uploadedFiles} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
