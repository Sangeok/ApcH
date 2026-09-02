"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef } from "react";
import { env } from "~/env";
import {
  type ActiveUploadedFileQueueState,
  isActiveProcessingStatus,
  isOptimisticUploadId,
  type RecoverableUploadDraftSummary,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import {
  currentUserActiveUploadQueueQueryOptions,
  currentUserUploadedFileListQueryOptions,
} from "~/fsd/features/upload/model/query-options";
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
  userId: string;
  uploadedFiles: UploadedFileSummary[];
  recoverableDrafts: RecoverableUploadDraftSummary[];
}

export default function DashboardView({
  userId,
  uploadedFiles,
  recoverableDrafts,
}: DashboardViewProps) {
  const router = useRouter();
  const initialActiveQueueFiles = useMemo(
    () => uploadedFiles.filter((file) => isActiveProcessingStatus(file.status)),
    [uploadedFiles],
  );
  const initialActiveQueueState = useMemo<ActiveUploadedFileQueueState>(
    () => ({
      queueFiles: initialActiveQueueFiles.slice(0, 25),
      activeUploadedFileIds: initialActiveQueueFiles.map((file) => file.id),
    }),
    [initialActiveQueueFiles],
  );

  const uploadedFilesQuery = useQuery(
    currentUserUploadedFileListQueryOptions(userId, uploadedFiles),
  );
  const activeQueueQuery = useQuery(
    currentUserActiveUploadQueueQueryOptions(userId, initialActiveQueueState),
  );

  const queriedUploadedFiles = uploadedFilesQuery.data ?? uploadedFiles;
  const activeQueueState = activeQueueQuery.data ?? initialActiveQueueState;
  const activeQueueFiles = activeQueueState.queueFiles;
  const [optimisticFiles, addOptimisticFile] = useOptimistic(
    queriedUploadedFiles,
    (state, newFile: UploadedFileSummary) => [newFile, ...state],
  );
  const optimisticQueueFiles = useMemo(
    () => optimisticFiles.filter((file) => isOptimisticUploadId(file.id)),
    [optimisticFiles],
  );
  const queueStatusFiles = useMemo(
    () => [...optimisticQueueFiles, ...activeQueueFiles],
    [activeQueueFiles, optimisticQueueFiles],
  );
  const activeUploadedFileIds = useMemo(
    () => new Set(activeQueueState.activeUploadedFileIds),
    [activeQueueState.activeUploadedFileIds],
  );
  const previousActiveUploadedFileIdsRef = useRef(activeUploadedFileIds);
  const refetchUploadedFiles = uploadedFilesQuery.refetch;

  useEffect(() => {
    const previousActiveUploadedFileIds =
      previousActiveUploadedFileIdsRef.current;
    const hasCompletedUpload = [...previousActiveUploadedFileIds].some(
      (uploadedFileId) => !activeUploadedFileIds.has(uploadedFileId),
    );

    if (hasCompletedUpload) {
      router.refresh();
      void refetchUploadedFiles();
    }

    previousActiveUploadedFileIdsRef.current = activeUploadedFileIds;
  }, [activeUploadedFileIds, refetchUploadedFiles, router]);

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
          <QueueStatus
            uploadedFiles={queueStatusFiles}
            isFetching={activeQueueQuery.isFetching}
            onRefresh={() => void activeQueueQuery.refetch()}
          />
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
              <UploadedFileList files={queriedUploadedFiles} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
