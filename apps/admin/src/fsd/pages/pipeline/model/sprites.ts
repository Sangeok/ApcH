import type { Tone } from "./briefing";

// mockgen.py PAL — 픽셀 세계의 리터럴 팔레트(oklch 토큰 재사용 안 함).
export const PIXEL_PALETTE: Record<string, string> = {
  k: "#2b2420",
  s: "#f2c9a0",
  w: "#fffdf6",
  d: "#b08968",
  D: "#8b5e34",
  m: "#6b7f96",
  g: "#cfe3d8",
  f: "#efe8d8",
  F: "#e6dcc6",
  W: "#f7f3e8",
  B: "#e0d7c2",
  p: "#c8b7e0",
  G: "#7fa66a",
};

// mockgen.py sprite() rows — 12행 × 12열. H=머리, T=셔츠는 extra로 주입.
export const SPRITE_ROWS: readonly string[] = [
  "...kkkkkk...",
  "..kHHHHHHk..",
  ".kHHHHHHHHk.",
  ".kHssssssHk.",
  ".kskssssksk.", // 눈 2개(col 3,8) + 좌우 윤곽
  ".kssssssssk.",
  "..kssssssk..",
  "...kssssk...",
  "..kTTTTTTk..",
  ".kTTTTTTTTk.",
  ".kTkTTTTkTk.",
  ".ks.TTTT.sk.",
];

export type Prop = "papers" | "laptop" | "glass" | "compass" | "ledger";

// mockgen.py prop_grid() — 격자 + dy(책상 상판 기준 세로 셀 오프셋).
export const PROP_GRIDS: Record<Prop, { rows: readonly string[]; dy: number }> =
  {
    laptop: { rows: ["..mmmm..", ".mggggm.", "mmmmmmmm"], dy: -3 },
    papers: { rows: ["wwww.", "wwwww", "wwwww"], dy: -3 },
    glass: { rows: ["..kk.", ".kwwk", ".kwwk", "k.kk."], dy: -4 },
    compass: { rows: [".kkk.", "kwGwk", "kwwwk", ".kkk."], dy: -4 },
    ledger: { rows: ["kkkkk", "kwGwk", "kGwwk", "kkkkk"], dy: -4 },
  };

// mockgen.py ID — 정체성 외형(캐릭터 완전 고정). id는 앱의 full agentId.
export type Appearance = { hair: string; shirt: string; prop: Prop };
const APPEARANCE: Record<string, Appearance> = {
  pm: { hair: "#2b2420", shirt: "#4a4080", prop: "papers" },
  "admin-dev": { hair: "#5a3b28", shirt: "#5f8a5a", prop: "laptop" },
  "web-dev": { hair: "#7a5230", shirt: "#8a6b4f", prop: "laptop" },
  "doc-auditor": { hair: "#8f8a80", shirt: "#7a6296", prop: "glass" },
  "feature-scout": { hair: "#3c4a3a", shirt: "#4f7d78", prop: "compass" },
  "backend-dev": { hair: "#52504b", shirt: "#37617a", prop: "laptop" },
  "plan-verifier": { hair: "#443a4a", shirt: "#8a4a52", prop: "ledger" },
};
const FALLBACK_APPEARANCE: Appearance = {
  hair: "#5a3b28",
  shirt: "#6b7f96",
  prop: "papers",
};
export function appearanceFor(agentId: string): Appearance {
  return APPEARANCE[agentId] ?? FALLBACK_APPEARANCE; // Record<string,…> → undefined 가능
}
export function spriteExtra(app: Appearance): Record<string, string> {
  return { H: app.hair, T: app.shirt };
}

// mockgen.py TONE + 침묵 규칙. hold는 시안에 없어 새로 정한 값(디자인 방향 참조).
export const BUBBLE_TONE_COLOR: Record<Tone, string | null> = {
  pending: "#976014",
  active: "#3e5a86",
  done: "#6f6b64", // 게이트 결정(4): 시안 #8b877f는 12px 대비 3.52:1(AA 미달) → 5.21:1로 조정
  hold: "#9a5a2f", // 시안 밖 유일 결정
  muted: null, // 침묵 규칙: 말풍선 없음
};
export function bubbleColorFor(tone: Tone): string | null {
  return BUBBLE_TONE_COLOR[tone]; // 유한 유니온 키 → undefined 안 붙음
}

// mockgen.py render_grid — "."=투명, extra 우선 후 팔레트. 미지 문자는 스킵.
export function resolveCell(
  ch: string,
  extra: Record<string, string>,
): string | null {
  if (ch === ".") return null;
  return extra[ch] ?? PIXEL_PALETTE[ch] ?? null;
}

export type PixelRect = { x: number; y: number; size: number; color: string };
export function gridToRects(
  rows: readonly string[],
  extra: Record<string, string>,
  cell: number,
  originX = 0,
  originY = 0,
): PixelRect[] {
  const out: PixelRect[] = [];
  rows.forEach((row, j) => {
    Array.from(row).forEach((ch, i) => {
      const color = resolveCell(ch, extra);
      if (color === null) return;
      out.push({
        x: originX + i * cell,
        y: originY + j * cell,
        size: cell,
        color,
      });
    });
  });
  return out;
}
