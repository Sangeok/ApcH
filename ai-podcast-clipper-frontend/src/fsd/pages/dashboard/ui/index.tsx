"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { env } from "~/env";
import type {
  RecoverableUploadDraftSummary,
  UploadedFileSummary,
} from "~/fsd/entities/uploaded-file/model/types";
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
import UploadedFileList from "~/fsd/widgets/uploaded-file-list/ui";
import QueueStatus from "./_component/QueueStatus";
import RecoverableUploadDrafts from "./_component/RecoverableUploadDrafts";
import UploadPodcast from "./_component/UploadPodcast";

interface DashboardViewProps {
  uploadedFiles: UploadedFileSummary[];
  recoverableDrafts: RecoverableUploadDraftSummary[];
}

export default function DashboardView({
  uploadedFiles,
  recoverableDrafts,
}: DashboardViewProps) {
  const [optimisticFiles, addOptimisticFile] = useOptimistic(
    uploadedFiles,
    (state, newFile: UploadedFileSummary) => [newFile, ...state],
  );

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
      {env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED && (
        <div className="flex justify-end">
          <Link href="/dashboard/billing">
            <Button>Buy Credits</Button>
          </Link>
        </div>
      )}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my-clips">My Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <UploadPodcast onOptimisticAdd={addOptimisticFile} />
          <RecoverableUploadDrafts drafts={recoverableDrafts} />
          <QueueStatus uploadedFiles={optimisticFiles} />
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
