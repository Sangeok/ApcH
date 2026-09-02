/**
 * Modal 콜백 wire 계약의 **단일 정본**.
 *
 * 이 형태는 두 경로로 들어온다 — 웹훅 직접 쓰기(`app/api/webhooks/modal/route.ts`)와
 * Inngest 워커의 폴링 응답(`inngest/functions.ts`). 이전에는 13필드 clip 타입이
 * 두 이름으로 세 번, 정규화기가 두 번 선언돼 있어서, 백엔드가 필드를 하나 추가하면
 * 세 곳을 고쳐야 했고 하나를 빠뜨리면 한쪽 경로에서만 값이 조용히 사라졌다.
 * 두 사본 모두 구조적으로 유효하므로 TypeScript가 그 드리프트를 잡지 못한다.
 *
 * `server-only`를 붙이지 않는다 — 라우트 핸들러와 Inngest 함수가 모두 임포트한다.
 */

/** 정규화를 마친 clip. DB에 쓰이는 형태다. */
export type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
  subtitleStatus?: string | null;
};

/** 백엔드가 보내는 그대로. camelCase와 snake_case가 섞여 온다. */
export type RawProcessVideoBackendClip = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  s3Key?: string | null;
  s3_key?: string | null;
  scriptText?: string | null;
  script_text?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtube_title?: string | null;
  youtubeDescription?: string | null;
  youtube_description?: string | null;
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
  subtitleStatus?: string | null;
};

/**
 * 분석 결과 moment의 canonical 형태. 웹훅 정규화 출력과 analyzeVideo의
 * wire 타입(`Partial<AnalyzedMoment>`)이 모두 이 타입에서 파생된다.
 */
export type AnalyzedMoment = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
};

export type RawAnalyzedMoment = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
};

export function toStrictNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

export function toStrictPositiveInteger(value: unknown): number | null {
  const parsed = toStrictNonNegativeInteger(value);

  return parsed !== null && parsed > 0 ? parsed : null;
}

// 선언한 타입이 실제로 참이 되도록 필드별로 좁힌다. 좁히지 않으면 문자열
// startSeconds나 객체 해시태그가 그대로 Clip 행에 기록된다.
function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: unknown[] = value;
  return items.every((item): item is string => typeof item === "string")
    ? items
    : null;
}

export function normalizeBackendClip(
  clip: unknown,
): ProcessVideoBackendClip | null {
  if (!clip || typeof clip !== "object") {
    return null;
  }

  const rawClip = clip as RawProcessVideoBackendClip;
  const index = toStrictNonNegativeInteger(rawClip.index);

  if (index === null) {
    return null;
  }

  return {
    index,
    startSeconds: toNullableNumber(rawClip.startSeconds ?? rawClip.start_seconds),
    endSeconds: toNullableNumber(rawClip.endSeconds ?? rawClip.end_seconds),
    s3Key: toNullableString(rawClip.s3Key ?? rawClip.s3_key),
    scriptText: toNullableString(rawClip.scriptText ?? rawClip.script_text),
    language: toNullableString(rawClip.language),
    youtubeTitle: toNullableString(rawClip.youtubeTitle ?? rawClip.youtube_title),
    youtubeDescription: toNullableString(
      rawClip.youtubeDescription ?? rawClip.youtube_description,
    ),
    youtubeHashtags: toNullableStringArray(
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags,
    ),
    clipType: toNullableString(rawClip.clipType ?? rawClip.clip_type),
    hook: toNullableString(rawClip.hook),
    payoff: toNullableString(rawClip.payoff),
    subtitleStatus: toNullableString(rawClip.subtitleStatus),
  };
}

export function normalizeBackendClips(
  clips: unknown,
): ProcessVideoBackendClip[] | undefined {
  if (!Array.isArray(clips)) {
    return undefined;
  }

  return clips
    .map(normalizeBackendClip)
    .filter((clip): clip is ProcessVideoBackendClip => clip !== null);
}

export function normalizeAnalyzedMoment(
  moment: unknown,
): AnalyzedMoment | null {
  if (!moment || typeof moment !== "object") {
    return null;
  }

  const raw = moment as RawAnalyzedMoment;
  const index = toStrictNonNegativeInteger(raw.index);
  const startSeconds = raw.startSeconds ?? raw.start_seconds;
  const endSeconds = raw.endSeconds ?? raw.end_seconds;

  if (
    index === null ||
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number"
  ) {
    return null;
  }

  return {
    index,
    startSeconds,
    endSeconds,
    clipType: toNullableString(raw.clipType ?? raw.clip_type),
    hook: toNullableString(raw.hook),
    payoff: toNullableString(raw.payoff),
  };
}

/**
 * Modal이 실어 보낸 오류 값을 사람이 읽을 문자열로.
 *
 * 두 호출부의 fallback 문구가 달라 파라미터로 받는다. 웹훅 쪽은 "오류 없음"을
 * `undefined`로 구분해야 하므로 nullish 처리는 호출부가 한다.
 */
export function toModalErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }

  return fallback;
}
