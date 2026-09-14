import {
  CLIP_COUNT_OPTIONS,
  DEFAULT_CLIP_COUNT,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from "~/fsd/shared/config/constants";

const SUPPORTED_LANGUAGE_VALUES = new Set<string>(
  SUPPORTED_LANGUAGES.map((option) => option.value),
);
const SUPPORTED_CLIP_COUNTS = new Set<number>(
  CLIP_COUNT_OPTIONS.map((option) => option.value),
);

/** 생성 모드 시스템 기본값. UploadPodcast의 초기 false(:75)와 같은 값이다. */
export const DEFAULT_REVIEW_BEFORE_GENERATE = false;

/** DB에 저장되는 형태. 각 필드 null = 설정 안 함 = 시스템 기본. */
export type StoredUploadDefaults = {
  defaultLanguage: string | null;
  defaultClipCount: number | null;
  defaultReviewBeforeGenerate: boolean | null;
};

/** 업로드 폼이 초기 state로 쓰는 구체값. */
export type ResolvedUploadDefaults = {
  language: string;
  clipCount: number;
  reviewBeforeGenerate: boolean;
};

/**
 * 저장된(nullable, 어쩌면 범위 밖) 기본값을 폼 초기값으로 해석한다.
 * null이거나 현재 지원 집합에 없으면 시스템 상수로 떨어진다 — 저장 시 검증이
 * 범위 밖 쓰기를 막지만, 지원 목록이 줄어든 뒤 읽는 경우를 방어한다.
 */
export function resolveUploadDefaults(
  stored: StoredUploadDefaults,
): ResolvedUploadDefaults {
  const language =
    stored.defaultLanguage !== null &&
    SUPPORTED_LANGUAGE_VALUES.has(stored.defaultLanguage)
      ? stored.defaultLanguage
      : DEFAULT_LANGUAGE;
  const clipCount =
    stored.defaultClipCount !== null &&
    SUPPORTED_CLIP_COUNTS.has(stored.defaultClipCount)
      ? stored.defaultClipCount
      : DEFAULT_CLIP_COUNT;
  const reviewBeforeGenerate =
    stored.defaultReviewBeforeGenerate ?? DEFAULT_REVIEW_BEFORE_GENERATE;

  return { language, clipCount, reviewBeforeGenerate };
}

/**
 * 설정 폼 입력을 DB 쓰기 페이로드로 정규화한다. 입력은 서버 액션 경계를 넘어온
 * 신뢰할 수 없는 값이라 타입까지 런타임 검증한다. null = 비우기(시스템 기본).
 * 범위 밖·잘못된 타입은 **거부**한다(null 반환) — 조용히 null로 바꾸지 않는다.
 */
export function normalizeUploadDefaults(input: {
  defaultLanguage: unknown;
  defaultClipCount: unknown;
  defaultReviewBeforeGenerate: unknown;
}): StoredUploadDefaults | null {
  const { defaultLanguage, defaultClipCount, defaultReviewBeforeGenerate } =
    input;

  if (
    defaultLanguage !== null &&
    !(
      typeof defaultLanguage === "string" &&
      SUPPORTED_LANGUAGE_VALUES.has(defaultLanguage)
    )
  ) {
    return null;
  }
  if (
    defaultClipCount !== null &&
    !(
      typeof defaultClipCount === "number" &&
      SUPPORTED_CLIP_COUNTS.has(defaultClipCount)
    )
  ) {
    return null;
  }
  if (
    defaultReviewBeforeGenerate !== null &&
    typeof defaultReviewBeforeGenerate !== "boolean"
  ) {
    return null;
  }

  // 위 세 거부 분기가 각 값을 이미 string|null·number|null·boolean|null로 좁혔다.
  // 여기에 `as` 단언을 붙이면 no-unnecessary-type-assertion 에러로 lint가 실패한다.
  return { defaultLanguage, defaultClipCount, defaultReviewBeforeGenerate };
}
