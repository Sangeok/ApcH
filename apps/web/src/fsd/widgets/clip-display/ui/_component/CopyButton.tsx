import { Check, Copy } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import type { CopiedField } from "~/fsd/widgets/clip-display/model/useMetadataClipboard";

const STYLES = {
  button:
    "group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg",
  shimmer:
    "absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
} as const;

interface CopyButtonProps {
  field: CopiedField;
  label: string;
  value: string;
  copiedField: CopiedField | null;
  onCopy: (field: CopiedField, value: string) => Promise<void>;
  disabled?: boolean;
}

export function CopyButton({ field, label, value, copiedField, onCopy, disabled }: CopyButtonProps) {
  const isCopied = copiedField === field;

  return (
    <Button
      variant="secondary"
      size="sm"
      className={STYLES.button}
      onClick={() => onCopy(field, value)}
      disabled={disabled}
    >
      <div className={STYLES.shimmer} />
      {isCopied ? (
        <>
          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          {label}
        </>
      )}
    </Button>
  );
}
