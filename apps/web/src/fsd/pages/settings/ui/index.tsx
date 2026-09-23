"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  saveDefaultCaptionStyle,
  saveUploadDefaults,
} from "~/fsd/features/settings/api";
import {
  CaptionStyleEditor,
  matchPresetId,
  sampleCaptionWords,
  SAMPLE_CAPTION_CLIP_END,
} from "~/fsd/features/caption-style";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  CLIP_COUNT_OPTIONS,
  DEFAULT_CLIP_COUNT,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";
import {
  DEFAULT_REVIEW_BEFORE_GENERATE,
  type ResolvedUploadDefaults,
} from "~/fsd/entities/user";
import { Button } from "~/fsd/shared/ui/atoms/button";
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

interface SettingsViewProps {
  initialDefaults: ResolvedUploadDefaults;
  initialCaptionStyles: CaptionStyleDefaults;
}

export default function SettingsView({
  initialDefaults,
  initialCaptionStyles,
}: SettingsViewProps) {
  const router = useRouter();
  const [language, setLanguage] = useState(initialDefaults.language);
  const [clipCount, setClipCount] = useState(initialDefaults.clipCount);
  const [reviewBeforeGenerate, setReviewBeforeGenerate] = useState(
    initialDefaults.reviewBeforeGenerate,
  );
  const [captionStyles, setCaptionStyles] = useState(initialCaptionStyles);
  // 편집 대상 언어. 업로드 기본 언어(language, Save defaults로 저장됨)와 분리한다 —
  // 한국어 스타일을 손보려고 업로드 언어를 건드리는 사고 경로를 막는다(FEAT-52 관측 4).
  // 이 값 자체는 저장하지 않는다.
  const [editLanguage, setEditLanguage] = useState(initialDefaults.language);
  const editKey = editLanguage === "Korean" ? "korean" : "english";
  const [isSaving, startSaving] = useTransition();

  const persist = (payload: {
    defaultLanguage: string | null;
    defaultClipCount: number | null;
    defaultReviewBeforeGenerate: boolean | null;
  }) =>
    startSaving(async () => {
      const result = await saveUploadDefaults(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // 계측은 fire-and-forget — 실패해도 저장(이미 성공)을 막지 않는다.
      // preset 키는 FEAT-42(캡션 기본값) 몫이라 여기서 싣지 않는다.
      void trackAnalyticsEvent("settings_defaults_saved", {
        source: "settings_page",
      });
      toast.success("Defaults saved");
      router.refresh();
    });

  const handleSave = () =>
    persist({
      defaultLanguage: language,
      defaultClipCount: clipCount,
      defaultReviewBeforeGenerate: reviewBeforeGenerate,
    });

  const handleReset = () => {
    setLanguage(DEFAULT_LANGUAGE);
    setClipCount(DEFAULT_CLIP_COUNT);
    setReviewBeforeGenerate(DEFAULT_REVIEW_BEFORE_GENERATE);
    persist({
      defaultLanguage: null,
      defaultClipCount: null,
      defaultReviewBeforeGenerate: null,
    });
  };

  const handleSaveCaption = () =>
    startSaving(async () => {
      const result = await saveDefaultCaptionStyle(captionStyles);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // 계측은 fire-and-forget(저장은 이미 성공). preset = matchPresetId 결과.
      void trackAnalyticsEvent("settings_defaults_saved", {
        source: "settings_page",
        preset: matchPresetId(captionStyles[editKey]),
      });
      toast.success("Caption style saved");
      router.refresh();
    });

  const handleResetCaption = () => {
    setCaptionStyles({ english: null, korean: null });
    startSaving(async () => {
      const result = await saveDefaultCaptionStyle({
        english: null,
        korean: null,
      });
      if (!result.success) toast.error(result.error);
      else {
        void trackAnalyticsEvent("settings_defaults_saved", {
          source: "settings_page",
          preset: matchPresetId(null), // "default"
        });
        toast.success("Caption style saved");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
      <CardHeader>
        <CardTitle>Upload defaults</CardTitle>
        <CardDescription>
          These options are pre-selected each time you upload. You can still
          change them for a single upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-x-2">
          <p className="mt-1.5 text-sm font-medium">Subtitle language</p>
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
          <p className="mt-1.5 text-sm font-medium">Number of clips</p>
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
        <div className="flex gap-x-2">
          <p className="mt-1.5 text-sm font-medium">Generation</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {reviewBeforeGenerate ? "Review first" : "Auto"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => setReviewBeforeGenerate(false)}
                className="cursor-pointer"
              >
                Auto (generate immediately)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setReviewBeforeGenerate(true)}
                className="cursor-pointer"
              >
                Review first (edit clips before generating)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex gap-x-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save defaults"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Reset to system defaults
          </Button>
        </div>
      </CardContent>
    </Card>
      <Card>
        <CardHeader>
          <CardTitle>Video style</CardTitle>
          <CardDescription>
            New uploads use this style. It&apos;s locked in when you upload — to
            change a video&apos;s style, upload it again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Captions</p>
            <p className="text-muted-foreground text-xs">
              Right now you can style the captions. Framing and background will
              live here too.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-medium">
              Editing
            </p>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Button
                key={lang.value}
                type="button"
                size="sm"
                variant={editLanguage === lang.value ? "default" : "outline"}
                onClick={() => setEditLanguage(lang.value)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-[11px]">
            This picks which language you&apos;re styling — it doesn&apos;t
            change your upload language.
          </p>
          <CaptionStyleEditor
            language={editLanguage}
            value={captionStyles[editKey]}
            sample
            playUrl={null}
            clipStart={0}
            clipEnd={SAMPLE_CAPTION_CLIP_END}
            words={sampleCaptionWords(editLanguage)}
            onChange={(style) =>
              setCaptionStyles((prev) => ({ ...prev, [editKey]: style }))
            }
          />
          <div className="flex gap-x-2">
            <Button onClick={handleSaveCaption} disabled={isSaving}>
              Save caption style
            </Button>
            <Button
              variant="outline"
              onClick={handleResetCaption}
              disabled={isSaving}
            >
              Reset both languages
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
