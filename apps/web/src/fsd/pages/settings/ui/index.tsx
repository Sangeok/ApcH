"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveUploadDefaults } from "~/fsd/features/settings/api";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  CLIP_COUNT_OPTIONS,
  DEFAULT_CLIP_COUNT,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
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
}

export default function SettingsView({ initialDefaults }: SettingsViewProps) {
  const router = useRouter();
  const [language, setLanguage] = useState(initialDefaults.language);
  const [clipCount, setClipCount] = useState(initialDefaults.clipCount);
  const [reviewBeforeGenerate, setReviewBeforeGenerate] = useState(
    initialDefaults.reviewBeforeGenerate,
  );
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

  return (
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
  );
}
