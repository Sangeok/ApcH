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
import { useRef, useState } from "react";
import { useUploadPodcast } from "~/fsd/pages/dashboard/model/useUploadPodcast";
import { getMaxFeasibleClipCount } from "~/fsd/pages/dashboard/model/clip-count-budget";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  UPLOAD_CONFIG,
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_CLIP_COUNT,
  CLIP_DURATION_LIMITS,
} from "~/fsd/shared/config/constants";
import type { UploadedFileSummary } from "~/fsd/entities/uploaded-file";

function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

function formatSourceLength(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
}

export default function UploadPodcast({ onOptimisticAdd }: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  // 드롭마다 증가시키는 요청 번호. 늦게 도착한 이전 파일의 측정 결과를 버리는 데 쓴다.
  const durationRequestId = useRef(0);
  const [reviewBeforeGenerate, setReviewBeforeGenerate] =
    useState<boolean>(false);
  const { upload, isUploading } = useUploadPodcast({
    onOptimisticAdd,
    onSuccess: () => setFiles([]),
  });

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setDurationSeconds(null);

    const file = acceptedFiles[0];

    if (file) {
      void trackAnalyticsEvent("upload_file_selected", {
        fileType: file.type,
        fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
        language,
        clipCount,
      });

      const requestId = ++durationRequestId.current;

      void readVideoDurationSeconds(file).then((seconds) => {
        // 이 드롭 이후에 다른 파일이 떨어졌으면 이 결과는 버린다.
        if (requestId !== durationRequestId.current) return;

        setDurationSeconds(seconds);
        const max = getMaxFeasibleClipCount(seconds);
        if (max >= 1) {
          // 클로저의 clipCount가 아니라 prev를 본다 — 시스템 보정이라 계측 이벤트는 내지 않는다.
          setClipCount((prev) => (prev > max ? max : prev));
        }
      });
    }
  };

  const handleUpload = () => {
    const file = files[0];
    if (!file) return;
    upload({ file, language, clipCount, reviewBeforeGenerate });
  };

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);

    const file = files[0];

    if (file) {
      void trackAnalyticsEvent("upload_options_changed", {
        fileType: file.type,
        fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
        language: nextLanguage,
        clipCount,
        reviewBeforeGenerate,
      });
    }
  };

  const handleClipCountChange = (nextClipCount: number) => {
    setClipCount(nextClipCount);

    const file = files[0];

    if (file) {
      void trackAnalyticsEvent("upload_options_changed", {
        fileType: file.type,
        fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
        language,
        clipCount: nextClipCount,
        reviewBeforeGenerate,
      });
    }
  };

  // 형제 핸들러(언어·개수)와 동일한 형태. 이 토글만 계측이 빠져 있었는데,
  // 검토 단계를 켜는 비율이 clip_review_* 퍼널의 분모라 함께 기록한다.
  const handleReviewModeChange = (nextReviewBeforeGenerate: boolean) => {
    setReviewBeforeGenerate(nextReviewBeforeGenerate);

    const file = files[0];

    if (file) {
      void trackAnalyticsEvent("upload_options_changed", {
        fileType: file.type,
        fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
        language,
        clipCount,
        reviewBeforeGenerate: nextReviewBeforeGenerate,
      });
    }
  };

  const maxFeasibleClips = getMaxFeasibleClipCount(durationSeconds);

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
                          onClick={() => handleLanguageChange(lang.value)}
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
                      {CLIP_COUNT_OPTIONS.map((option) => {
                        const disabled =
                          maxFeasibleClips >= 1 &&
                          option.value > maxFeasibleClips;
                        return (
                          <DropdownMenuItem
                            key={option.value}
                            disabled={disabled}
                            onClick={() => handleClipCountChange(option.value)}
                            className="cursor-pointer"
                          >
                            {option.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex gap-x-2">
                  <p className="mt-1.5 text-sm font-medium">Generation:</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        {reviewBeforeGenerate ? "Review first" : "Auto"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => handleReviewModeChange(false)}
                        className="cursor-pointer"
                      >
                        Auto (generate immediately)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleReviewModeChange(true)}
                        className="cursor-pointer"
                      >
                        Review first (edit clips before generating)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {files.length > 0 && durationSeconds !== null && (
                <p className="text-muted-foreground text-xs">
                  {maxFeasibleClips === 0
                    ? `Source is shorter than ${CLIP_DURATION_LIMITS.MIN_SECONDS}s — too short to generate a clip. Try a longer video.`
                    : `Source length ${formatSourceLength(durationSeconds)}. This fits up to ${maxFeasibleClips} ${maxFeasibleClips === 1 ? "clip" : "clips"}; the AI may return fewer.`}
                </p>
              )}
            </div>
          )}
        </div>
        <Button
          disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}
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
