"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { SegmentedControl, SegmentedControlItem } from "~/fsd/shared/ui/atoms/segmented-control";

import Dropzone, { type DropzoneState } from "react-dropzone";
import Link from "next/link";
import { formatSecondsAsClock } from "~/fsd/shared/lib/format-duration";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { FileVideo, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import {
  toFileSizeMb,
  useUploadPodcast,
} from "~/fsd/pages/dashboard/model/useUploadPodcast";
import { getMaxFeasibleClipCount } from "~/fsd/pages/dashboard/model/clip-count-budget";
import { clipCountNotice } from "~/fsd/pages/dashboard/model/clip-count-notice";
import {
  generationModeHint,
  uploadButtonLabel,
} from "~/fsd/pages/dashboard/model/upload-options-copy";
import {
  captionStyleLabel,
  CaptionStyleThumbnail,
} from "~/fsd/features/caption-style";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  UPLOAD_CONFIG,
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_LIMITS,
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
import { videoFramingSummary } from "~/fsd/shared/config/video-framing";
import type { ResolvedUploadDefaults } from "~/fsd/entities/user";
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

/** 옵션 변경 계측의 페이로드 모양. 바뀐 필드만 override로 넘긴다. */
type UploadOptionsPayload = {
  language: string;
  clipCount: number;
  reviewBeforeGenerate: boolean;
};

interface UploadPodcastProps {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
  defaults: ResolvedUploadDefaults;
  defaultCaptionStyles: CaptionStyleDefaults;
  defaultVideoPaddingPercent: number;
}

export default function UploadPodcast({
  onOptimisticAdd,
  defaults,
  defaultCaptionStyles,
  defaultVideoPaddingPercent,
}: UploadPodcastProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>(defaults.language);
  const [clipCount, setClipCount] = useState<number>(defaults.clipCount);
  const framingSummary = videoFramingSummary(defaultVideoPaddingPercent);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  // 드롭마다 증가시키는 요청 번호. 늦게 도착한 이전 파일의 측정 결과를 버리는 데 쓴다.
  const durationRequestId = useRef(0);
  const [reviewBeforeGenerate, setReviewBeforeGenerate] = useState<boolean>(
    defaults.reviewBeforeGenerate,
  );
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
        fileSizeMb: toFileSizeMb(file),
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

  // 세 핸들러가 바뀐 옵션 하나만 다른 같은 15줄 블록을 들고 있었다.
  // 페이로드 모양이 한 곳에 있어야 필드를 추가할 때 셋 중 하나를 빠뜨리지 않는다.
  const trackOptionsChanged = (overrides: Partial<UploadOptionsPayload>) => {
    const file = files[0];

    if (!file) {
      return;
    }

    void trackAnalyticsEvent("upload_options_changed", {
      fileType: file.type,
      fileSizeMb: toFileSizeMb(file),
      language,
      clipCount,
      reviewBeforeGenerate,
      ...overrides,
    });
  };

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    trackOptionsChanged({ language: nextLanguage });
  };

  const handleClipCountChange = (nextClipCount: number) => {
    setClipCount(nextClipCount);
    trackOptionsChanged({ clipCount: nextClipCount });
  };

  // 형제 핸들러(언어·개수)와 동일한 형태. 이 토글만 계측이 빠져 있었는데,
  // 검토 단계를 켜는 비율이 clip_review_* 퍼널의 분모라 함께 기록한다.
  const handleReviewModeChange = (nextReviewBeforeGenerate: boolean) => {
    setReviewBeforeGenerate(nextReviewBeforeGenerate);
    trackOptionsChanged({ reviewBeforeGenerate: nextReviewBeforeGenerate });
  };

  const maxFeasibleClips = getMaxFeasibleClipCount(durationSeconds);

  const langStyle =
    language === "Korean"
      ? defaultCaptionStyles.korean
      : defaultCaptionStyles.english;
  const clipHint = clipCountNotice(durationSeconds);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Podcast</CardTitle>
        <CardDescription>
          Upload your audio or video files to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dropzone
          onDrop={handleFileDrop}
          maxSize={UPLOAD_CONFIG.MAX_FILE_SIZE}
          accept={UPLOAD_CONFIG.ACCEPTED_TYPES}
          maxFiles={1}
          disabled={isUploading}
        >
          {(dropzone: DropzoneState) =>
            files.length === 0 ? (
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
                <Button variant="default" size="sm" disabled={isUploading} className="cursor-pointer">
                  Select File
                </Button>
              </div>
            ) : (
              <div
                {...dropzone.getRootProps()}
                className="flex items-center gap-3 rounded-lg border border-dashed p-3 transition hover:cursor-pointer hover:bg-muted"
              >
                <input {...dropzone.getInputProps()} />
                <div className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-md">
                  <FileVideo className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{files[0]?.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {files[0] ? toFileSizeMb(files[0]).toFixed(1) : "0.0"} MB
                    {durationSeconds !== null && `, ${formatSecondsAsClock(durationSeconds)}`}
                  </p>
                  {maxFeasibleClips === 0 && (
                    <p className="text-destructive text-xs">
                      {`Source is shorter than ${CLIP_DURATION_LIMITS.MIN_SECONDS}s — too short to generate a clip. Try a longer video.`}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-xs font-medium">
                  Replace
                </span>
              </div>
            )
          }
        </Dropzone>

        <div className="@container">
          {files.length > 0 && (
            <div className="grid grid-cols-1 gap-y-2 @[600px]:grid-cols-[152px_minmax(0,1fr)] @[600px]:gap-x-6 @[600px]:gap-y-4 @[600px]:items-start">
              <p className="text-muted-foreground text-xs @[600px]:col-span-2">
                Pre-filled from your settings. Changes here apply to this upload only.
              </p>

              <p id="upload-lang-label" className="pt-1.5 text-sm font-medium">
                Subtitle language
              </p>
              <div>
                <SegmentedControl
                  aria-labelledby="upload-lang-label"
                  value={language}
                  onValueChange={handleLanguageChange}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SegmentedControlItem key={lang.value} value={lang.value} className="flex-1 @[600px]:flex-none">
                      {lang.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>

              <p id="upload-clip-label" className="pt-1.5 text-sm font-medium">
                Number of clips
              </p>
              <div className="space-y-1.5">
                <SegmentedControl
                  aria-labelledby="upload-clip-label"
                  value={String(clipCount)}
                  onValueChange={(v) => handleClipCountChange(Number(v))}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  {CLIP_COUNT_OPTIONS.map((option) => {
                    const hasClipCountCap = maxFeasibleClips >= 1;
                    const isOptionUnreachable =
                      hasClipCountCap && option.value > maxFeasibleClips;
                    return (
                      <SegmentedControlItem
                        key={option.value}
                        value={String(option.value)}
                        disabled={isOptionUnreachable}
                        className="flex-1 tabular-nums @[600px]:flex-none"
                      >
                        {option.value}
                      </SegmentedControlItem>
                    );
                  })}
                </SegmentedControl>
                {clipHint && <p className="text-muted-foreground text-xs">{clipHint}</p>}
              </div>

              <p id="upload-gen-label" className="pt-1.5 text-sm font-medium">
                Generation
              </p>
              <div className="space-y-1.5">
                <SegmentedControl
                  aria-labelledby="upload-gen-label"
                  value={reviewBeforeGenerate ? "review" : "auto"}
                  onValueChange={(v) => handleReviewModeChange(v === "review")}
                  disabled={isUploading}
                  className="w-full @[600px]:w-fit"
                >
                  <SegmentedControlItem value="auto" className="flex-1 @[600px]:flex-none">
                    Auto
                  </SegmentedControlItem>
                  <SegmentedControlItem value="review" className="flex-1 @[600px]:flex-none">
                    Review first
                  </SegmentedControlItem>
                </SegmentedControl>
                <p className="text-muted-foreground text-xs">
                  {generationModeHint(reviewBeforeGenerate)}
                </p>
              </div>

              <div className="bg-border my-1 h-px @[600px]:col-span-2" role="presentation" />

              <p id="upload-style-label" className="flex flex-col pt-1.5 text-sm font-medium">
                Video style
                <span className="text-muted-foreground text-xs font-normal">From settings</span>
              </p>
              <div className="flex items-start gap-4">
                <CaptionStyleThumbnail
                  style={langStyle}
                  language={language}
                  paddingPercent={defaultVideoPaddingPercent}
                />
                <div className="min-w-0 space-y-2">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Captions</dt>
                    <dd className="font-medium">{captionStyleLabel(langStyle)}</dd>
                    <dt className="text-muted-foreground">Framing</dt>
                    <dd className="font-medium">{framingSummary ?? "None"}</dd>
                  </dl>
                  <p className="text-muted-foreground text-xs">
                    Caption style follows the subtitle language.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="text-primary inline-block text-xs underline underline-offset-2"
                  >
                    Change in settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 파일 선택 전에도 비활성으로 보인다 — 현재 버튼이 files 가드 밖인 것과 같다(요구 (a)). */}
          <div className={cn("flex justify-end", files.length > 0 && "mt-6")}>
            <Button
              disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}
              onClick={handleUpload}
              className="w-full @[600px]:w-auto"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                uploadButtonLabel(reviewBeforeGenerate)
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
