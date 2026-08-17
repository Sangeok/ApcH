import { PipelineCommandButton } from "~/fsd/features/run-pipeline-command";
import type { TeamMember } from "../../model/briefing";
import { deskCommandFor } from "../../model/desk-commands";
import {
  appearanceFor,
  bubbleColorFor,
  gridToRects,
  PROP_GRIDS,
} from "../../model/sprites";
import { PixelSprite } from "./pixel-sprite";

// 머리 중앙 정렬로 적응한 mockgen bubble()(디자인 방향 (2)).
function SpeechBubble({
  cx,
  text,
  color,
}: {
  cx: number;
  text: string;
  color: string;
}) {
  const w = Math.max(64, Math.min(13 * text.length + 24, 190));
  const x = cx - w / 2;
  const y = 8; // yChar(48) - 40
  return (
    <g shapeRendering="crispEdges">
      <rect
        x={x}
        y={y}
        width={w}
        height={26}
        fill="#fffdf6"
        stroke={color}
        strokeWidth={2}
      />
      <rect
        x={cx - 4}
        y={y + 26}
        width={8}
        height={5}
        fill="#fffdf6"
        stroke={color}
        strokeWidth={2}
      />
      <rect x={cx - 2} y={y + 31} width={4} height={4} fill={color} />
      <text
        x={cx}
        y={y + 17}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={12}
        fill={color}
      >
        {text}
      </text>
    </g>
  );
}

// mockgen desk() 이식. 책상 16셀(상판 1셀 d·앞면 2셀 D) + 소품 + 명패(폭 초과 허용).
function PixelDesk({ agentId, name }: { agentId: string; name: string }) {
  const cell = 6;
  const y0 = 104; // yChar(48) + 9*cell + 2
  const app = appearanceFor(agentId);
  const propSpec = PROP_GRIDS[app.prop];
  const propRects = gridToRects(
    propSpec.rows,
    {},
    cell,
    9 * cell,
    y0 + propSpec.dy * cell,
  );
  const cx = 8 * cell; // 48
  const pw = 9 * name.length + 22;
  const px = cx - pw / 2;
  return (
    <g shapeRendering="crispEdges">
      {Array.from({ length: 16 }, (_, i) => (
        <g key={i}>
          <rect x={i * cell} y={y0} width={cell} height={cell} fill="#b08968" />
          <rect
            x={i * cell}
            y={y0 + cell}
            width={cell}
            height={cell * 2}
            fill="#8b5e34"
          />
        </g>
      ))}
      {propRects.map((r, i) => (
        <rect
          key={`p${i}`}
          x={r.x}
          y={r.y}
          width={r.size}
          height={r.size}
          fill={r.color}
        />
      ))}
      <rect x={px - 2} y={y0 + cell - 2} width={pw + 4} height={18} fill="#2b2420" />
      <rect x={px} y={y0 + cell} width={pw} height={14} fill="#3d342c" />
      <text
        x={cx}
        y={y0 + cell + 11}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={13}
        fontWeight={700}
        fill="#fffdf6"
      >
        {name}
      </text>
    </g>
  );
}

const PIXEL_BUTTON_CLASS =
  "h-auto rounded-none border-2 border-[#2b2420] bg-[#fffdf6] px-2 py-0.5 font-mono text-[11px] font-bold text-[#2b2420] shadow-[2px_2px_0_0_#3d342c] hover:bg-[#f2ecdc]";

// mockgen seat() 순서: 말풍선 → 캐릭터 → 책상(책상이 캐릭터 다리를 덮는다).
// muted면 말풍선 생략(침묵 규칙). 명령 버튼만 HTML <button>(포커스·useTransition).
function PixelDeskUnit({ member }: { member: TeamMember }) {
  const cmd = deskCommandFor(member.identity.id);
  const bubbleColor = bubbleColorFor(member.tone);
  return (
    <div className="flex w-40 flex-col items-center gap-1.5">
      <svg
        viewBox="-32 0 160 132"
        role="img"
        aria-label={`${member.identity.handle} — ${member.state}`}
        shapeRendering="crispEdges"
        className="w-full"
      >
        {bubbleColor !== null && (
          <SpeechBubble cx={48} text={member.state} color={bubbleColor} />
        )}
        {/* 캐릭터: 좌석 x+12, yChar 48. 책상이 뒤에 그려져 다리를 덮는다 */}
        <g transform="translate(12 48)">
          <PixelSprite agentId={member.identity.id} cell={6} />
        </g>
        <PixelDesk agentId={member.identity.id} name={member.identity.handle} />
      </svg>
      <p className="font-sans text-xs text-[#5c5348]">{member.identity.role}</p>
      {member.heldId && (
        <span className="border border-[#e0d7c2] bg-[#fffdf6] px-1 font-mono text-[10px] text-[#5c5348]">
          {member.heldId}
        </span>
      )}
      {cmd && (
        <PipelineCommandButton
          command={cmd.key}
          label={cmd.label}
          className={PIXEL_BUTTON_CLASS}
        />
      )}
    </div>
  );
}

const FRAME_GRID: readonly string[] = ["kkkkk", "kwgwk", "kwwwk", "kkkkk"];
const PLANT_GRID: readonly string[] = [
  ".GGG.",
  "GGGGG",
  ".GGG.",
  ".ppp.",
  ".ppp.",
];

function DecorSprite({
  rows,
  cell,
  className,
}: {
  rows: readonly string[];
  cell: number;
  className: string;
}) {
  const w = (rows[0]?.length ?? 0) * cell; // noUncheckedIndexedAccess: rows[0]은 string | undefined
  const h = rows.length * cell;
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {gridToRects(rows, {}, cell).map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.size}
          height={r.size}
          fill={r.color}
        />
      ))}
    </svg>
  );
}

function PixelRoomBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" shapeRendering="crispEdges">
        <defs>
          <pattern
            id="pixel-floor"
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
          >
            <rect width={24} height={24} fill="#efe8d8" />
            <rect width={12} height={12} fill="#e6dcc6" />
            <rect x={12} y={12} width={12} height={12} fill="#e6dcc6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f7f3e8" />
        <rect y={64} width="100%" height={8} fill="#e0d7c2" />
        <rect y={72} width="100%" height="100%" fill="url(#pixel-floor)" />
      </svg>
      <DecorSprite rows={FRAME_GRID} cell={5} className="absolute left-6 top-3" />
      <DecorSprite rows={PLANT_GRID} cell={6} className="absolute right-4 top-8" />
    </div>
  );
}

// 반응형: 폰 2열 격자 → 데스크톱 가로 flex-wrap, 가로 스크롤 없음.
export function PixelOffice({ team }: { team: TeamMember[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">
        사무실
      </h2>
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <PixelRoomBackdrop />
        <div className="relative grid grid-cols-2 justify-items-center gap-x-2 gap-y-6 p-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
          {team.map((member) => (
            <PixelDeskUnit key={member.identity.id} member={member} />
          ))}
        </div>
      </div>
    </section>
  );
}
