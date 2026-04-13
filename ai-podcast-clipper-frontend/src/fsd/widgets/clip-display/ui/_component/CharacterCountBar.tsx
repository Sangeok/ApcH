const STYLES = {
  bar: {
    normal: "bg-gradient-to-r from-amber-500 to-orange-500",
    over: "bg-gradient-to-r from-red-500 to-red-600",
  },
  count: {
    normal: "text-muted-foreground",
    over: "text-red-500",
  },
} as const;

interface CharacterCountBarProps {
  label: string;
  current: number;
  max: number;
}

export function CharacterCountBar({ label, current, max }: CharacterCountBarProps) {
  const isOver = current > max;
  const fillPercent = Math.min((current / max) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`text-xs font-medium tabular-nums ${isOver ? STYLES.count.over : STYLES.count.normal}`}>
          {current}/{max}
        </span>
      </div>
      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? STYLES.bar.over : STYLES.bar.normal}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
