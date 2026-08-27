import { gridToRects } from "../../model/sprites";

export function OwnerBanner({ pendingCount }: { pendingCount: number }) {
  const subtitle =
    pendingCount > 0
      ? `결재 ${pendingCount}건이 도장을 기다립니다`
      : "지금 도장을 기다리는 결재가 없습니다";
  const docRects = gridToRects(
    ["..wwwww..", ".wwwwwww.", ".wwwwwww.", "wwwwwwwww", "wwwwwwwww"],
    {},
    6,
    60,
    26,
  );
  const stampRects = gridToRects(
    [".oo.", "oooo", "oooo", ".oo."],
    { o: "#976014" },
    6,
    150,
    30,
  );

  return (
    <div className="relative">
      <svg
        viewBox="0 0 660 96"
        aria-hidden="true"
        shapeRendering="crispEdges"
        className="w-full"
      >
        <rect width={660} height={96} fill="#f5efdf" />
        {Array.from({ length: 44 }, (_, index) => (
          <g key={index}>
            <rect x={index * 15} y={56} width={15} height={8} fill="#b08968" />
            <rect x={index * 15} y={64} width={15} height={26} fill="#8b5e34" />
          </g>
        ))}
        {docRects.map((rect, index) => (
          <rect
            key={`d${index}`}
            x={rect.x}
            y={rect.y}
            width={rect.size}
            height={rect.size}
            fill={rect.color}
          />
        ))}
        <rect
          x={57}
          y={23}
          width={60}
          height={36}
          fill="none"
          stroke="#2b2420"
          strokeWidth={2}
        />
        {stampRects.map((rect, index) => (
          <rect
            key={`s${index}`}
            x={rect.x}
            y={rect.y}
            width={rect.size}
            height={rect.size}
            fill={rect.color}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 pl-[30.3%] pr-3">
        <p
          className="text-sm leading-tight font-bold"
          style={{ fontFamily: "ui-monospace, monospace", color: "#2b2420" }}
        >
          당신의 책상
        </p>
        <p
          className="text-xs leading-snug"
          style={{ fontFamily: "ui-sans-serif, system-ui", color: "#976014" }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
