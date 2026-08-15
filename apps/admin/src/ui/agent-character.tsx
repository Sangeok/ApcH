import { cn } from "~/lib/utils";
import type { Tone } from "~/pipeline/briefing";

type Pose = "idle" | "work" | "request" | "done" | "hold";
type Role = "pm" | "dev" | "auditor" | "scout" | "generic";

const POSE_FOR_TONE: Record<Tone, Pose> = {
  muted: "idle",
  active: "work",
  pending: "request", // 결재/검토 대기 = 서류를 들어올린 "요청" 자세
  done: "done",
  hold: "hold",
};

// 색=상태. 유휴는 채움 없음(텅 빈 도형 = 아무 일 없음).
const TONE_FILL: Record<Tone, string> = {
  pending: "fill-stamp",
  active: "fill-active",
  done: "fill-silence",
  hold: "fill-hold",
  muted: "fill-none",
};

// 팔 각도가 곧 자세다. 오른팔=소품 팔(어깨 46,31), 왼팔(어깨 26,31).
const RIGHT_ARM_DEG: Record<Pose, number> = {
  idle: 10,
  work: -30,
  request: -62,
  done: 16,
  hold: -96, // 팔짱: 가슴 앞 가로
};
const LEFT_ARM_DEG: Record<Pose, number> = {
  idle: -10,
  work: -6,
  request: -8,
  done: -10,
  hold: 96, // 팔짱
};
// 소품은 팔과 분리해 배치(포즈별 손 위치). 회전과 무관하게 항상 정립.
const PROP_AT: Record<Pose, { x: number; y: number }> = {
  idle: { x: 50, y: 50 },
  work: { x: 39, y: 52 }, // 앞으로, 낮게(작업)
  request: { x: 52, y: 27 }, // 들어올림(요청)
  done: { x: 50, y: 54 }, // 책상 위 내려놓음
  hold: { x: 39, y: 50 }, // 옆에 치워둠
};

function roleForAgent(agentId: string): Role {
  switch (agentId) {
    case "pm":
      return "pm";
    case "admin-dev":
    case "web-dev":
      return "dev";
    case "doc-auditor":
      return "auditor";
    case "feature-scout":
      return "scout";
    default:
      return "generic";
  }
}

// 소품(로컬 원점 기준 ~12px). 역할 실루엣이 역할을 나른다.
function RoleProp({ role }: { role: Role }) {
  switch (role) {
    case "pm": // 서류철
      return (
        <>
          <rect
            x={-6}
            y={-5}
            width={12}
            height={10}
            rx={1.5}
            className="fill-card"
          />
          <line x1={-3} y1={-1} x2={3} y2={-1} />
          <line x1={-3} y1={2} x2={2} y2={2} />
        </>
      );
    case "dev": // 노트북
      return (
        <>
          <rect
            x={-6}
            y={-5}
            width={12}
            height={8}
            rx={1}
            className="fill-card"
          />
          <path d="M-7 3 L7 3 L5 5 L-5 5 Z" className="fill-card" />
        </>
      );
    case "auditor": // 돋보기
      return (
        <>
          <circle cx={-1} cy={-1} r={4} className="fill-card" />
          <line x1={2} y1={2} x2={6} y2={6} />
        </>
      );
    case "scout": // 나침반
      return (
        <>
          <circle cx={0} cy={0} r={5} className="fill-card" />
          <path d="M0 -4 L2 0 L0 4 L-2 0 Z" className="fill-foreground" />
        </>
      );
    case "generic":
      return null;
  }
}

export function AgentCharacter({
  agentId,
  tone,
  className,
}: {
  agentId: string;
  tone: Tone;
  className?: string;
}) {
  const role = roleForAgent(agentId);
  const pose = POSE_FOR_TONE[tone];
  const prop = PROP_AT[pose];
  return (
    <svg
      viewBox="0 0 72 72"
      aria-hidden="true"
      className={cn("text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 머리 */}
      <circle cx={36} cy={15} r={8} className="fill-card" />
      {/* 몸통(자세 무관). 채움 = 상태색 */}
      <path
        d="M24 30 Q24 27 27 27 L45 27 Q48 27 48 30 L50 58 L22 58 Z"
        className={cn(TONE_FILL[tone])}
      />
      {/* 왼팔 */}
      <g
        transform={`rotate(${LEFT_ARM_DEG[pose]} 26 31)`}
        className="transition-transform"
      >
        <line x1={26} y1={31} x2={22} y2={50} />
      </g>
      {/* 오른팔(소품 팔) */}
      <g
        transform={`rotate(${RIGHT_ARM_DEG[pose]} 46 31)`}
        className="transition-transform"
      >
        <line x1={46} y1={31} x2={50} y2={50} />
      </g>
      {/* 소품: 팔과 분리, 포즈별 손 위치에 정립 */}
      <g transform={`translate(${prop.x} ${prop.y})`}>
        <RoleProp role={role} />
      </g>
    </svg>
  );
}
