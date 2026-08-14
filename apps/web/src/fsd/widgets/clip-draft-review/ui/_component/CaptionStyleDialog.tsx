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
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import CaptionStyleEditor from "./CaptionStyleEditor";

interface CaptionStyleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
  // 서버에 저장된 스타일. 열릴 때마다 이 값으로 작업본을 다시 만든다.
  initialValue: CaptionStyle | null;
  previewWords: string[];
  onApply: (style: CaptionStyle | null) => void;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
}

export default function CaptionStyleDialog({
  open,
  onOpenChange,
  language,
  initialValue,
  previewWords,
  onApply,
  onApplyToAll,
  isApplyingToAll,
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
          previewWords={previewWords}
          onChange={setWorking}
        />

        <DialogFooter className="sm:justify-between">
          {/* 작업본만 비운다. 저장(= 언어 기본값으로 리셋)은 Apply가 한다. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setWorking(null)}
          >
            Reset style
          </Button>
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
