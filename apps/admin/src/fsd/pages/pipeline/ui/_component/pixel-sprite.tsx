import {
  SPRITE_ROWS,
  appearanceFor,
  gridToRects,
  spriteExtra,
} from "../../model/sprites";

// 12×12 픽셀 캐릭터. 외형은 agentId에서만 나온다(상태는 말풍선이 나른다).
export function PixelSprite({
  agentId,
  cell = 6,
}: {
  agentId: string;
  cell?: number;
}) {
  const rects = gridToRects(
    SPRITE_ROWS,
    spriteExtra(appearanceFor(agentId)),
    cell,
  );
  return (
    <g shapeRendering="crispEdges">
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.size}
          height={r.size}
          fill={r.color}
        />
      ))}
    </g>
  );
}
