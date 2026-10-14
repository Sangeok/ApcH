# BUG-18: 설정 `Video style` 카드의 저장 버튼 둘을 하나로 합치고 미저장 변경을 표시한다

agent: web-dev

## 현재 동작

`Video style` 카드(`pages/settings/ui/index.tsx`) 안에 **저장 버튼이 둘**이고, 서로 다른 서버 액션·DB 갱신을 호출한다.

- **여백 저장**: `index.tsx:293` `<Button onClick={() => persistVideoPadding(videoPaddingPercent)} disabled={isSaving}>`("Save framing")가 `persistVideoPadding`(`:77-91`)을 부른다. 이 핸들러는 `saveDefaultVideoPaddingPercent(percent)`(`:80`)를 호출하고, try/catch로 DB 오류를 잡아(`:88-90`) 실패 시 `toast.error`만 내고 로컬 값을 유지하며, 성공 시 `setVideoPaddingPercent` + `toast.success("Video framing saved")` + `router.refresh()`.
- **자막 저장**: `index.tsx:338` `<Button onClick={handleSaveCaption} disabled={isSaving}>`("Save caption style")가 `handleSaveCaption`(`:131-145`)을 부른다. 이 핸들러는 `saveDefaultCaptionStyle(captionStyles)`(`:133`)를 호출한다 — **try/catch가 없다**. 성공 시 `settings_defaults_saved` 이벤트에 `preset: matchPresetId(captionStyles[editKey])`(`:141`)를 싣고 `toast.success("Caption style saved")` + `router.refresh()`.

슬라이더는 로컬 상태만 바꾸고(`:284` `onChange={(event) => setVideoPaddingPercent(Number(event.currentTarget.value))}`), 미리보기는 그 **미저장** 값으로 띠를 그린다(`:266` `paddingPercent={videoPaddingPercent}`). 캡션 편집은 `onChange`(`:333-335`)로 `captionStyles` 로컬 상태를 바꾼다. **미저장 표시도 이탈 경고도 없다.**

리셋 둘은 누르는 즉시 저장한다 — `:296` `<Button variant="outline" onClick={() => persistVideoPadding(0)} ...>`("Reset framing")는 `persistVideoPadding(0)`으로 즉시 DB 저장, `:343` `handleResetCaption`(`:147-164`)은 로컬을 비운 뒤 `saveDefaultCaptionStyle({english:null, korean:null})`를 즉시 호출. **편집은 로컬인데 리셋만 즉시 저장이라 규칙이 둘이다.**

서버 액션(`features/settings/api/index.ts`):
- `saveDefaultCaptionStyle`(`:42-71`): `captionStyleSchema.safeParse`로 두 언어를 검증(`:57`), `updateUserDefaultCaptionStyle`(`:65`)로 저장, `revalidatePath("/dashboard/settings")`(`:69`)만. **DB 오류를 잡지 않는다** — try/catch 없음.
- `saveDefaultVideoPaddingPercent`(`:73-90`): `parseVideoPaddingPercent`(`:79`)로 검증, `updateUserDefaultVideoPaddingPercent`(`:83`)를 try/catch로 감싸(`:82-87`) 실패 시 `failure("Could not save video framing. Try again.")`, `revalidatePath("/dashboard/settings")`(`:88`)만.

엔티티 쓰기(`entities/user/api/index.ts`):
- `updateUserDefaultCaptionStyle`(`:177-192`): `db.user.update`로 `defaultCaptionStyleEnglish`·`defaultCaptionStyleKorean` 두 컬럼을 쓴다(`:187-190`).
- `updateUserDefaultVideoPaddingPercent`(`:201-209`): `db.user.update`로 `defaultVideoPaddingPercent` 한 컬럼을 쓴다(`:206-207`).

호출부 확인(grep 전수): 세 서버 액션(`saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent`·`saveUploadDefaults`)의 호출부는 `pages/settings/ui/index.tsx`뿐이다. 두 엔티티 쓰기(`updateUserDefaultCaptionStyle`·`updateUserDefaultVideoPaddingPercent`)의 호출부는 삭제 대상인 두 서버 액션뿐이다(`features/settings/api/index.ts:65`·`:83`).

분석 이벤트 소비자: `settings_defaults_saved`의 허용 메타데이터 키는 `shared/analytics/lib/metadata.ts:58` `settings_defaults_saved: ["source", "preset"]`이고, `packages/db/src/analytics-contract.ts:38`에 이름이 등록돼 있다. **`apps/admin` 전체 grep에서 이 이벤트 이름이나 `preset` 키를 읽는 소비자는 0건이다**(admin은 퍼널·집계를 이벤트 이름 단위로만 읽고 이 이벤트는 어느 퍼널에도 없다). 여백 저장 경로(`persistVideoPadding`)는 분석 이벤트를 전혀 쏘지 않는다 — `settings_defaults_saved`에 `preset` 키가 실리는 것은 자막 저장 경로뿐이다.

분리 저장의 출처는 FEAT-58·FEAT-60이다 — `docs/plans/FEAT-58.md:323` "기존 자막 저장/초기화는 여백 컬럼을 건드리지 않고, 새 여백 저장/초기화는 자막 컬럼을 건드리지 않는다", `:1193` 정지 조건 "caption 저장이 여백을 갱신하는 결합", `docs/plans/FEAT-60.md:26` 요구 ⑤ "여백 저장 로직…은 설정 페이지에 남기고 편집기는 슬롯만 내준다(…「자막 저장이 여백을 건드리지 않는다」 보존)".

## 문제

요구의 원천은 `TASK_BACKLOG.md`의 BUG-18(소유자 2026-10-14 보고, 관측 1~4). 편집은 띠를 보며 여백·자막을 함께 맞추는 **한 동작**이 됐는데(FEAT-60이 슬라이더를 편집기 칸 안으로, FEAT-62가 미리보기 드래그를 추가) 저장은 **둘**로 남아, 소유자가 자연스럽게 `Save caption style`만 누르고 `Save framing`을 안 눌러 여백(`defaultVideoPaddingPercent` 0)이 경고 없이 버려졌다(관측 1·2로 확정). 코드에서 이 둘은 `index.tsx:293`·`:338`의 두 버튼 ↔ 두 서버 액션(`features/settings/api/index.ts:42`·`:73`) ↔ 두 DB 갱신(`entities/user/api/index.ts:177`·`:201`)이다.

소유자 결정(2026-10-14): 「자막 저장은 여백을 건드리지 않는다」 **불변식을 폐기한다**(FEAT-58 `:323`·`:1193`, FEAT-60 요구 ⑤). DB 구조(공통 여백 1칸 + 언어별 캡션 2칸)는 유지. 백로그는 자막 저장 경로의 결함을 전제하지 않는다(드래그 위치와 저장값 불일치는 미확인 → 별도 항목).

**이 계획이 폐기하는 것(코드에서의 소재):** 두 서버 액션의 분리(`saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent`)와 두 즉시-저장 리셋. 폐기 후에는 여백·두 언어 캡션이 **하나의 서버 액션·하나의 `db.user.update`**로 저장된다. 불변식을 근거로 한 **코드 주석·테스트**는 다음 하나뿐이다 — `features/caption-style/ui/CaptionStyleEditor.tsx:33` `// 상태·저장 로직은 끼우는 쪽이 소유한다(요구 ⑤).` 이 주석의 **substance("슬롯의 상태·저장 로직은 끼우는 페이지가 소유한다")는 폐기 후에도 참**이므로(페이지가 여전히 여백 상태와 합친 저장을 소유) 이 파일은 고치지 않는다. "(요구 ⑤)" 참조만 역사적 꼬리표로 남는데, 이는 문서 위생 사항이라 이 항목에서 손대지 않고 아래 「비고」로 보고한다. 불변식을 지키던 **코드 테스트는 없다**(`apps/web` 전수 grep: `여백을 건드리지`·`INV-FRAMING`·`REQ-FRAMING-008` 0건 — 불변식은 계획서·배포 원장에만 있었고, 원장 편집은 메인 루프 몫).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/fsd/features/settings/api/index.ts` | `saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent` 삭제. 합친 액션 `saveVideoStyle` 신설(여백 + 두 언어 캡션을 한 번에 검증→`updateUserVideoStyle` 한 번, DB 오류 try/catch). import에서 두 옛 쓰기 제거·`updateUserVideoStyle` 추가. `saveUploadDefaults`는 그대로 |
| `apps/web/src/fsd/entities/user/api/index.ts` | `updateUserDefaultCaptionStyle`·`updateUserDefaultVideoPaddingPercent` 삭제. 세 컬럼을 **한 `db.user.update`**로 쓰는 `updateUserVideoStyle` 신설 |
| `apps/web/src/fsd/entities/user/server.ts` | 서버 barrel에서 두 옛 쓰기 제거·`updateUserVideoStyle` 추가 |
| `apps/web/src/fsd/pages/settings/ui/index.tsx` | 저장 버튼 하나(`Save video style`, dirty일 때만 활성)·미저장 안내·`beforeunload` 경고. 리셋 둘은 **로컬만** 되돌림(즉시 저장 제거). 저장 성공 시 baseline 갱신 + 합친 액션 호출 + `settings_defaults_saved`. `saved separately` 안내 문구 교체. import 교체(`saveVideoStyle`·`useEffect`·`hasUnsavedVideoStyle`) |
| `apps/web/src/fsd/pages/settings/model/video-style-dirty.ts` `(신규)` | 「편집값이 저장값과 다른가」 순수 비교 함수 |
| `apps/web/src/fsd/pages/settings/model/video-style-dirty.test.mjs` `(신규)` | 위 함수 테스트 |

범위: 수정 4개 / 신규 2개. 전부 `apps/web/src/fsd/` 안이다.

## 구현 스케치

### `pages/settings/model/video-style-dirty.ts` (신규, 본문 전체)

```typescript
import type {
  CaptionStyle,
  CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";

export interface VideoStyleSnapshot {
  paddingPercent: number;
  captionStyles: CaptionStyleDefaults;
}

// CaptionStyle의 전 필드. 하나라도 빠지면 그 필드만 바꾼 편집이 미저장으로 안 잡혀
// 저장 버튼이 켜지지 않는다. Record<keyof CaptionStyle, true>라 필드가 늘거나 빠지면
// tsc가 깨진다 — 배열에 satisfies만 걸면 빠진 키를 못 잡는다(marginV가 FEAT-61·62에서 실제로 늘었다).
const CAPTION_STYLE_FIELDS: Record<keyof CaptionStyle, true> = {
  position: true,
  fontSize: true,
  color: true,
  maxWordsPerLine: true,
  outlineColor: true,
  outlineWidth: true,
  uppercase: true,
  marginV: true,
};
const CAPTION_STYLE_KEYS = Object.keys(CAPTION_STYLE_FIELDS) as (keyof CaptionStyle)[];

// null(=언어 기본값)과 객체는 DB에 다르게 쓰이므로 서로 다르다.
// 둘 다 객체면 필드별로 비교하되 undefined와 null을 같게 본다
// — 옛 저장값에는 marginV 키가 없다(런타임 undefined). 그 위에서 Position 버튼을
//   누르면 편집기가 marginV: null을 실어 보내므로(CaptionStyleEditor emit), 보이는 것이
//   그대로여도 거짓 미저장이 되는 것을 막는다.
function captionStyleEquals(
  a: CaptionStyle | null,
  b: CaptionStyle | null,
): boolean {
  if (a === null || b === null) return a === b;
  return CAPTION_STYLE_KEYS.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

export function hasUnsavedVideoStyle(
  saved: VideoStyleSnapshot,
  current: VideoStyleSnapshot,
): boolean {
  return (
    saved.paddingPercent !== current.paddingPercent ||
    !captionStyleEquals(
      saved.captionStyles.english,
      current.captionStyles.english,
    ) ||
    !captionStyleEquals(saved.captionStyles.korean, current.captionStyles.korean)
  );
}
```

### `entities/user/api/index.ts` — `updateUser*` 교체

`updateUserDefaultCaptionStyle`(`:177-192`)와 `updateUserDefaultVideoPaddingPercent`(`:201-209`)를 삭제하고 하나로 합친다. `Prisma`·`CaptionStyleDefaults`는 이미 import돼 있다(`:4`·`:6`).

```typescript
export async function updateUserVideoStyle(
  userId: string,
  input: { paddingPercent: number } & CaptionStyleDefaults,
) {
  // 세 컬럼을 한 update로 쓴다 — 반쪽 저장이 생기지 않게(BUG-18).
  // null = 비우기(언어 기본값): Prisma는 JSON 컬럼에 명시적 null을 JsonNull로 쓴다.
  return db.user.update({
    where: { id: userId },
    data: {
      defaultVideoPaddingPercent: input.paddingPercent,
      defaultCaptionStyleEnglish: input.english ?? Prisma.JsonNull,
      defaultCaptionStyleKorean: input.korean ?? Prisma.JsonNull,
    },
  });
}
```

### `entities/user/server.ts` — barrel 교체

`:17-18`의 `updateUserDefaultCaptionStyle,`·`updateUserDefaultVideoPaddingPercent,` 두 줄을 지우고 `updateUserVideoStyle,`를 (알파벳 순) 추가한다. `getUserDefaultCaptionStyle`·`getUserDefaultVideoPaddingPercent`(route가 읽음)는 그대로 둔다.

### `features/settings/api/index.ts` — 합친 저장 액션

import 교체: `~/fsd/entities/user/server`에서 `updateUserDefaultCaptionStyle`·`updateUserDefaultVideoPaddingPercent`를 빼고 `updateUserVideoStyle`를 넣는다(`updateUserUploadDefaults`는 유지). `saveDefaultCaptionStyle`(`:42-71`)·`saveDefaultVideoPaddingPercent`(`:73-90`)를 삭제하고 아래를 둔다.

```typescript
export async function saveVideoStyle(input: {
  paddingPercent: unknown;
  captionStyles: CaptionStyleDefaults;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const percent = parseVideoPaddingPercent(input.paddingPercent);
  if (percent === null) return failure("Invalid video padding percent");

  // null = 언어 기본값으로 비우기(검증 안 함). 값이 있으면 write-time 단일 검증.
  // 파싱 결과를 쓴다 — z.object가 모르는 키를 떨궈 조작된 여분 키가 저장·스냅샷·
  // Modal 페이로드로 흘러가지 않게(기존 saveDefaultCaptionStyle과 같은 관용).
  const validate = (
    value: CaptionStyle | null,
  ): { ok: true; style: CaptionStyle | null } | { ok: false } => {
    if (value === null) return { ok: true, style: null };
    // 옛 저장값에는 marginV 키가 없다(타입은 필수지만 런타임엔 undefined). z.number().nullable()은 undefined를
    // 거부하므로 null로 받는다. 저장은 parsed.data라 null로 정규화되어 앞으로 키가 생긴다.
    const parsed = captionStyleSchema.safeParse({
      ...value,
      marginV: value.marginV ?? null,
    });
    return parsed.success ? { ok: true, style: parsed.data } : { ok: false };
  };

  const english = validate(input.captionStyles.english);
  const korean = validate(input.captionStyles.korean);
  if (!english.ok || !korean.ok) return failure("Invalid caption style");

  try {
    await updateUserVideoStyle(authResult.data.userId, {
      paddingPercent: percent,
      english: english.style,
      korean: korean.style,
    });
  } catch (error) {
    console.error("Failed to save video style", error);
    return failure("Could not save video style. Try again.");
  }

  revalidatePath("/dashboard/settings");
  return success();
}
```

### `pages/settings/ui/index.tsx` — UI 통합

`:3` import에 `useEffect` 추가. `:6-10`에서 `saveDefaultCaptionStyle`·`saveDefaultVideoPaddingPercent`를 빼고 `saveVideoStyle`를 넣는다(`saveUploadDefaults` 유지). 새 import: `import { hasUnsavedVideoStyle } from "~/fsd/pages/settings/model/video-style-dirty";`.

저장 baseline을 state로 들고 dirty를 계산한다(`:72` 아래, `videoPaddingPercent` state 근처):

```typescript
const [savedVideoStyle, setSavedVideoStyle] = useState({
  paddingPercent: initialVideoPaddingPercent,
  captionStyles: initialCaptionStyles,
});
const videoStyleDirty = hasUnsavedVideoStyle(savedVideoStyle, {
  paddingPercent: videoPaddingPercent,
  captionStyles,
});
```

`persistVideoPadding`(`:77-91`)·`handleSaveCaption`(`:131-145`)·`handleResetCaption`(`:147-164`)를 지우고 아래로 바꾼다:

```typescript
const handleSaveVideoStyle = () =>
  startSaving(async () => {
    try {
      const result = await saveVideoStyle({
        paddingPercent: videoPaddingPercent,
        captionStyles,
      });
      if (!result.success) {
        toast.error(result.error);
        return; // 편집값 유지·성공 토스트 없음 (REQ-FRAMING-008 확장)
      }
      setSavedVideoStyle({ paddingPercent: videoPaddingPercent, captionStyles });
      // 계측은 fire-and-forget. preset = 지금 편집 중인 언어의 매칭 결과.
      void trackAnalyticsEvent("settings_defaults_saved", {
        source: "settings_page",
        preset: matchPresetId(captionStyles[editKey]),
      });
      toast.success("Video style saved");
      router.refresh();
    } catch {
      toast.error("Could not save video style. Try again.");
    }
  });

const handleResetFraming = () => setVideoPaddingPercent(0); // 로컬만
const handleResetCaptions = () =>
  setCaptionStyles({ english: null, korean: null }); // 로컬만
```

미저장일 때 브라우저 이탈 경고(앱 내 `<Link>` 이동은 막지 않는다 — 「대안」 참조):

```typescript
useEffect(() => {
  if (!videoStyleDirty) return;
  const handler = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [videoStyleDirty]);
```

framing 블록(`:292-299`)에서 "Save framing" 버튼을 빼고 "Reset framing"만 **로컬 리셋**으로 남긴다:

```tsx
                  <div className="flex gap-x-2">
                    <Button variant="outline" onClick={handleResetFraming} disabled={isSaving}>
                      Reset framing
                    </Button>
                  </div>
```

캡션 영역 안내 문구(`:304`)를 교체한다 — 지금은 "Caption styles are saved separately for each language."라 **버튼 하나로 합친 저장과 어긋난다**(언어별로 따로 저장한다는 오해):

```tsx
                    Each language has its own caption style.
```

카드 하단 버튼 묶음(`:337-348`)을 저장 하나 + 캡션 리셋 + 미저장 안내로 바꾼다:

```tsx
          <div className="flex items-center gap-x-2">
            <Button onClick={handleSaveVideoStyle} disabled={isSaving || !videoStyleDirty}>
              {isSaving ? "Saving..." : "Save video style"}
            </Button>
            <Button variant="outline" onClick={handleResetCaptions} disabled={isSaving}>
              Reset both languages
            </Button>
            {videoStyleDirty && (
              <p className="text-muted-foreground text-xs">Unsaved changes</p>
            )}
          </div>
```

framing 도움말의 "Captions keep their current position. Applies to both languages."(`:290-291`)는 **그대로 둔다** — 여백 슬라이더가 자막 위치를 옮기지 않는다는 뜻(INV-FRAMING-004)이고 합친 저장 뒤에도 참이다. `CaptionStyleEditor`의 `leadingControls`·`onVerticalChange` API는 바뀌지 않으므로 그 파일은 고치지 않는다.

## 테스트

- **덮는 것** (`video-style-dirty.test.mjs`, `hasUnsavedVideoStyle` 통해):
  1. 동일(여백 같고 두 캡션 값 같음) → `false`
  2. 여백만 다름 → `true`
  3. english 캡션 한 필드 다름 → `true`
  4. korean 캡션 한 필드 다름 → `true`
  5. saved·current 둘 다 `null` 캡션 → `false`
  6. saved `null`, current 비-null(필드 하나 설정) → `true`
  7. saved 비-null, current `null`(Default 누름) → `true`
  8. **옛 저장값 회귀**: saved 캡션에 `marginV` 키 없음(undefined) vs current `marginV: null`, 나머지 동일 → `false`(undefined/null 합침 — 불러오자마자 거짓 미저장이 뜨지 않음)
  9. `marginV` 433 vs 200 → `true`
  10. 같은 값·다른 객체 참조 → `false`(참조가 아니라 값 비교)
  11. **필드 전수** — `CaptionStyle`의 여덟 필드(`position`·`fontSize`·`color`·`maxWordsPerLine`·`outlineColor`·`outlineWidth`·`uppercase`·`marginV`) 각각에 대해, 그 필드 **하나만** 다른 값으로 바꾼 current → `true`. 표 하나를 돌리는 한 `it`이면 된다. 1~10만으로는 여덟 필드 중 다섯(`position`·`maxWordsPerLine`·`outlineColor`·`outlineWidth`·`uppercase`)을 비교 목록에서 지워도 전부 통과한다(메인 루프 2026-10-15 돌연변이 실측). tsc가 목록 누락을 잡지만 러너(tsx)는 타입을 보지 않으므로 런타임에서도 잡는다.
- **못 덮는 범위(배포 후 수동 확인)**: 러너에 DOM이 없어 **저장 버튼 활성/비활성·`beforeunload` 경고·토스트·실제 DB 반영**은 판정하지 못한다. 합친 서버 액션·`db.user.update`의 원자성, `revalidatePath`, 분석 이벤트 전송도 러너 밖(외부 I/O)이다. 배포 후 수동 확인과 배포 원장(`docs/release-checks.md`, 편집은 메인 루프) 영향:
  - `:79` 「**저장 분리가 그대로인가**(회귀)」(FEAT-60, 미결) — 이 항목이 저장 분리를 폐기하므로 **대체 마감** 대상. 더 이상 "자막 저장이 여백을 안 건드린다"를 확인하지 않는다(의도적으로 함께 저장).
  - `:53` 「**스냅·프리셋·저장**」(FEAT-62) — `Save caption style` 문구가 `Save video style`로 바뀌므로 **재앵커** 대상. "끌어 놓고 저장 → 새로고침하면 같은 위치"는 버튼 이름만 바꿔 유효. "Framing 설명(「Captions keep their current position…」)은 그대로"는 그대로 참(그 문구 유지).
  - `:325` 「**설정 화면에 캡션 기본 스타일 카드가 보이고…**」 — `Save caption style` 문구를 `Save video style`로 **재앵커** 대상.
  - `:129`(FEAT-58, 확인됨·이력) — 손대지 않는다.
  - 신규 수동 확인 후보(메인 루프가 원장 등재 판단): ① 여백·두 언어 캡션을 함께 바꾸고 `Save video style` 한 번 → 새로고침 시 셋 다 반영. ② 저장 뒤 버튼 비활성, 편집하면 다시 활성 + "Unsaved changes" 표시. ③ 미저장 상태로 새로고침/탭 닫기 시 브라우저 경고. ④ `Reset framing`·`Reset both languages`는 로컬만 되돌리고 저장 전엔 DB 불변.

## 합친 저장이 만드는 결합 (확인한 것)

- **여백 저장이 캡션 검증에 묶인다.** 합친 액션은 두 언어 캡션이 `captionStyleSchema`를 통과해야 여백도 저장한다. 저장된 캡션이 지금 스키마를 못 넘으면 여백만 바꿔도 `Invalid caption style`로 실패한다. 2026-10-15 실제 DB 읽기 전용 재생 결과는 다음과 같다. 사용자 8명 가운데 저장된 캡션은 2개이고 둘 다 통과한다(`marginV` 정규화 후, 실패 0). 그중 하나는 `marginV` 키가 없는 옛 형태라 테스트 8의 합침이 실제 데이터에 필요하다. 앞으로 스키마 범위를 좁히는 항목은 기존 저장값의 통과 여부를 따로 확인해야 한다.
- **두 탭 동시 저장은 세 컬럼 전체가 나중 저장으로 덮인다.** 전에는 여백과 캡션이 다른 액션이라 한 탭은 여백만, 다른 탭은 캡션만 저장할 수 있었다. 이제는 낡은 탭의 저장이 세 값을 함께 덮는다. 설정은 소유자 한 사람이 편집하는 값이고, 두 언어 캡션은 원래도 한 번에 덮였다(`updateUserDefaultCaptionStyle`). 그래서 받아들인다.

## 범위 밖 의존

없음. DB 스키마(공통 여백 1칸 + 언어별 캡션 2칸)는 변경하지 않고 마이그레이션도 없다 — 세 컬럼은 이미 존재한다(FEAT-54·FEAT-58). 변경은 전부 `apps/web/src/fsd/` 안이다. `packages/db`·`apps/admin`·`apps/backend`를 건드리지 않는다(분석 이벤트 소비자 0건으로 계약·메타데이터·admin 변경 불필요).

## 대안

- **앱 내 `<Link>` 이동 가로채기** (결정 2): 하지 않는다. `beforeunload`는 새로고침·탭 닫기·외부 이동만 막는다. Next 15 App Router에는 `router.events`(Pages Router의 `beforeHistoryChange`)에 해당하는 **안정적 네비게이션 차단 API가 없다**. `document`에 캡처 단계 클릭 리스너를 걸어 `<a>` 이동을 가로채는 방법은 가능하나, 떠나보내는 링크(대시보드 헤더, 우리 소유 아님)까지 포괄하려면 전역 리스너가 정상 네비게이션을 깨뜨릴 위험이 크고 테스트로 고정할 수도 없다. 비용 대비 가치가 낮다 — 핵심 결함(버튼 둘 중 하나만 누름)은 저장 버튼 하나 + 미저장 표시로 이미 제거된다. 앱 내 이동 미차단은 「못 덮는 범위」에 남긴다.
- **두 액션을 남기고 dirty 표시만 추가**: 요구 ①이 "반쪽 저장 없음(한 번의 DB 갱신)"을 요구하므로 불가. 두 액션을 순차 호출하면 두 번째 실패 시 첫 번째가 이미 커밋돼 반쪽 저장이 난다 — 그래서 `updateUserVideoStyle` 한 번으로 합친다.
- **dirty 비교를 `JSON.stringify`로**: 키 순서와 undefined 처리에 민감하다. 옛 저장값은 `marginV` 키가 없어(undefined→생략) current(`marginV: null`→포함)와 문자열이 달라져 거짓 미저장이 난다. 그래서 필드별로 null/undefined를 합쳐 비교한다.
- **revalidate 대상에 `/dashboard` 추가**: 하지 않는다. 폐기되는 두 액션 모두 `/dashboard/settings`만 revalidate했고, 메인 루프가 `/dashboard` 폼의 낡은 값은 revalidate 문제가 아니라고 판단했다(Next 15.5.7 동적 페이지 staleTime 0 + 설정 화면 `router.refresh()`). 대상을 바꿀 근거가 없어 `/dashboard/settings`만 유지한다.
