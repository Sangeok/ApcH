"use client";

import { useEffect, useState } from "react";

import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/fsd/shared/ui/atoms/dialog";
import type { TranscriptWord } from "~/fsd/features/clip-review";
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import { CaptionStyleEditor } from "~/fsd/features/caption-style";

interface CaptionStyleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
  // 서버에 저장된 스타일. 열릴 때마다 이 값으로 작업본을 다시 만든다.
  initialValue: CaptionStyle | null;
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
  onApply: (style: CaptionStyle | null) => void;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
  // Reset이 되돌릴 대상 — 업로드 스냅샷(null이면 언어 기본값).
  snapshotValue: CaptionStyle | null;
  onSaveAsDefault: (style: CaptionStyle | null) => void;
  isSavingDefault: boolean;
}

export default function CaptionStyleDialog({
  open,
  onOpenChange,
  language,
  initialValue,
  playUrl,
  clipStart,
  clipEnd,
  words,
  onApply,
  onApplyToAll,
  isApplyingToAll,
  snapshotValue,
  onSaveAsDefault,
  isSavingDefault,
}: CaptionStyleDialogProps) {
  // 편집은 작업본에서만 일어난다. Apply 전에는 아무것도 저장되지 않으므로
  // Cancel/바깥 클릭이 곧 되돌리기다.
  const [working, setWorking] = useState<CaptionStyle | null>(initialValue);

  // 열리는 시점의 서버 값으로 다시 시드한다. 다른 카드에서 Apply to all 한
  // 결과가 반영되고, 지난 번에 취소한 편집이 남아 있지 않다.
  useEffect(() => {
    if (open) {
      setWorking(initialValue);
    }
    // initialValue는 의존성에서 제외한다. 열려 있는 동안 서버 값이 갱신돼도
    // 사용자가 편집 중인 작업본을 덮어써서는 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Caption style</DialogTitle>
          <DialogDescription>
            Changes apply to this clip when you press Apply.
          </DialogDescription>
        </DialogHeader>

        <CaptionStyleEditor
          language={language}
          value={working}
          playUrl={playUrl}
          clipStart={clipStart}
          clipEnd={clipEnd}
          words={words}
          onChange={setWorking}
        />

        <DialogFooter className="sm:justify-between">
          {/* 좌측은 "기본값 관리"(Reset·Save as default), 우측은 "이 클립에 적용". */}
          <div className="flex gap-2">
            {/* Reset은 업로드 스냅샷으로 되돌린다(FEAT-50). 스냅샷이 null이면
                지금까지처럼 언어 기본값이다. 저장은 Apply/Save가 한다. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setWorking(snapshotValue)}
            >
              Reset style
            </Button>
            {/* 마음에 드는 스타일을 이 순간 사용자 기본값으로 캡처한다.
                계측·토스트는 훅(saveCaptionStyleAsDefault)이 발신한다.
                working === null 가드는 Apply to all clips(:104·:106)와 같은 형태다 —
                null을 그대로 보내면 saveDefaultCaptionStyle이 기본값을 "비운다"(설정
                화면 handleResetCaption:120이 그 용법). 버튼 이름과 반대 동작이 된다. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSavingDefault || working === null}
              onClick={() => {
                if (working === null) return;
                onSaveAsDefault(working);
              }}
            >
              Save as my default
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isApplyingToAll || working === null}
              onClick={() => {
                if (working === null) return;
                onApplyToAll(working);
                onOpenChange(false);
              }}
            >
              Apply to all clips
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(working);
                onOpenChange(false);
              }}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
