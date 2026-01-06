# YouTube 메타데이터 자동 생성 기능 구현 가이드

## 개요

각 클립에 대해 Gemini AI를 활용하여 SEO 최적화된 YouTube 제목, 설명, 해시태그를 자동 생성하는 기능입니다.

### 목표
- 시청자 유입 극대화를 위한 매력적인 제목 생성
- SEO 최적화된 설명 작성
- 트렌디한 해시태그 추천

---

## 수정 대상 파일

| 파일 경로 | 수정 내용 |
|-----------|----------|
| `ai-podcast-clipper-backend/main.py` | `generate_youtube_metadata()` 함수 추가 |
| `prisma/schema.prisma` | Clip 모델에 3개 필드 추가 |
| `src/inngest/functions.ts` | 타입 정의 및 DB 저장 로직 수정 |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | 메타데이터 UI 드로어 추가 |

---

## 구현 단계

### 1단계: Database Schema 수정

**파일**: `prisma/schema.prisma`

Clip 모델에 다음 필드를 추가합니다:

```prisma
model Clip {
  id String @id @default(cuid())
  s3Key String

  startSeconds Float?
  endSeconds Float?
  scriptText String?

  // NEW: YouTube 메타데이터 필드
  youtubeTitle       String?   // YouTube 제목 (100자 제한)
  youtubeDescription String?   // YouTube 설명 (5000자 제한)
  youtubeHashtags    String?   // 해시태그 JSON 배열 문자열

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  uploadedFile UploadedFile? @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)
  uploadedFileId String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String
}
```

**마이그레이션 실행**:
```bash
cd ai-podcast-clipper-frontend
npm run db:push
```

---

### 2단계: Backend - Gemini 메타데이터 생성 함수

**파일**: `ai-podcast-clipper-backend/main.py`

`process_clip()` 함수 **앞** (약 line 448 이전)에 다음 함수를 추가합니다:

```python
def generate_youtube_metadata(script_text: str, language: str, gemini_client) -> dict:
    """
    Gemini AI를 사용하여 SEO 최적화된 YouTube 메타데이터를 생성합니다.

    Args:
        script_text: 클립의 스크립트/자막 텍스트
        language: "English" 또는 "Korean"
        gemini_client: 초기화된 Gemini 클라이언트

    Returns:
        dict: { title, description, hashtags[] }
    """
    default_metadata = {
        "title": "",
        "description": "",
        "hashtags": []
    }

    if not script_text or not script_text.strip():
        print("Warning: Empty script text, skipping metadata generation")
        return default_metadata

    # SEO 최적화 프롬프트
    prompt = f"""You are a YouTube SEO expert specializing in podcast content. Generate optimized metadata for a short-form podcast clip.

# Input Script:
{script_text}

# Target Language: {language}

# Requirements:

## Title (100 characters max, 60 recommended):
- Hook the viewer in first 3 words
- Include 1-2 relevant keywords
- Create curiosity or urgency
- Avoid clickbait that doesn't deliver
- Use power words: "How", "Why", "Secret", "Truth"

## Description (500 characters max):
- First 150 characters are critical (shown in search results)
- Summarize the key insight or story
- Include a call-to-action (subscribe, comment, share)
- Use relevant keywords naturally

## Hashtags (5-7 tags):
- Mix broad and niche hashtags
- Include: 1 trending tag, 2-3 topic tags, 2-3 niche tags
- Include #Shorts for short-form content

# Output Format (JSON only):
{{
    "title": "Your engaging title here",
    "description": "Your SEO-optimized description here",
    "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"]
}}

# Rules:
- Return ONLY valid JSON, no code fences or explanations
- If language is Korean, generate all content in Korean
- If language is English, generate all content in English
- Ensure title fits within YouTube's 100-character limit
- Hashtags should be single words or short phrases without spaces
"""

    # 한국어 추가 지침
    if language == "Korean":
        prompt += """

# Korean-Specific Guidelines:
- Use natural Korean expressions, not direct translations
- Consider Korean search trends and vocabulary
- Use Hangul hashtags primarily, mix with English trending tags
- Title should be punchy in Korean style (rhetorical questions work well)
- Description should use formal-polite register (합니다체)
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7,  # 창의적인 제목을 위해 높은 temperature
            )
        )

        response_text = response.text.strip()

        # 마크다운 코드 펜스 제거
        if response_text.startswith("```"):
            response_text = response_text[3:].strip()
            if response_text.lower().startswith("json"):
                response_text = response_text[4:].lstrip()
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

        metadata = json.loads(response_text)

        # 검증 및 정제
        return {
            "title": str(metadata.get("title", ""))[:100],  # YouTube 제한
            "description": str(metadata.get("description", ""))[:5000],
            "hashtags": [
                str(tag) for tag in metadata.get("hashtags", [])
                if isinstance(tag, str)
            ][:15]  # YouTube 최대 15개 해시태그
        }

    except json.JSONDecodeError as e:
        print(f"Metadata JSON parse error: {e}")
        return default_metadata
    except Exception as e:
        print(f"Metadata generation error: {e}")
        return default_metadata
```

---

### 3단계: Backend - process_clip() 함수 수정

**파일**: `ai-podcast-clipper-backend/main.py`

`process_clip()` 함수의 return 문 직전(약 line 549-558)에 메타데이터 생성을 추가합니다:

```python
# script_text 생성 후 (기존 코드)
# ...

# 메타데이터 생성 추가
youtube_metadata = generate_youtube_metadata(script_text, selected_language, self.gemini_client)

return {
    "index": clip_index,
    "startSeconds": float(start_time),
    "endSeconds": float(end_time),
    "s3Key": uploaded_clip_s3_key,
    "scriptText": script_text,
    "language": selected_language,
    # 새로운 필드
    "youtubeTitle": youtube_metadata["title"],
    "youtubeDescription": youtube_metadata["description"],
    "youtubeHashtags": youtube_metadata["hashtags"],
}
```

---

### 4단계: Frontend - Inngest 함수 수정

**파일**: `src/inngest/functions.ts`

#### 4.1 타입 정의 수정 (lines 14-21)

```typescript
type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  // 새로운 필드
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};
```

#### 4.2 DB 저장 로직 수정 (lines 125-137)

```typescript
const createData = backendClips
  .filter(
    (c) => typeof c?.s3Key === "string" && c.s3Key.length > 0,
  )
  .map((c) => ({
    s3Key: c.s3Key as string,
    uploadedFileId,
    userId,
    startSeconds: c.startSeconds ?? null,
    endSeconds: c.endSeconds ?? null,
    scriptText: c.scriptText ?? null,
    // 새로운 필드
    youtubeTitle: c.youtubeTitle ?? null,
    youtubeDescription: c.youtubeDescription ?? null,
    youtubeHashtags: c.youtubeHashtags
      ? JSON.stringify(c.youtubeHashtags)
      : null,
  }));
```

---

### 5단계: Frontend - ClipCard UI 추가

**파일**: `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`

#### 5.1 Import 수정

기존 lucide-react import에 `Check`, `Hash`, `Type` 아이콘을 추가합니다:

```typescript
// 기존 import 수정 (lines 4-13)
import {
  Check,     // NEW
  Copy,
  Download,
  FileText,
  Hash,      // NEW
  Loader2,
  MoreHorizontal,
  Play,
  Trash,
  Type,      // NEW
  X,
} from "lucide-react";

// 새로운 import 추가
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/fsd/shared/ui/atoms/tabs";
```

React import에 `useMemo`를 추가합니다:

```typescript
// 기존 import 수정 (line 15)
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
```

#### 5.2 State 및 Helper 추가

```typescript
const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);
const [copiedField, setCopiedField] = useState<string | null>(null);

// 해시태그 JSON 파싱
const youtubeHashtags: string[] = useMemo(() => {
  if (!clip.youtubeHashtags) return [];
  try {
    return JSON.parse(clip.youtubeHashtags);
  } catch {
    return [];
  }
}, [clip.youtubeHashtags]);

const hasMetadata = clip.youtubeTitle || clip.youtubeDescription || youtubeHashtags.length > 0;
```

#### 5.3 복사 핸들러

```typescript
const handleCopyMetadata = async (field: string, value: string) => {
  if (!value) {
    toast.error(`${field} is not available.`);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success(`Copied ${field.toLowerCase()}.`);
    setTimeout(() => setCopiedField(null), 2000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Failed to copy: ${message}`);
  }
};

const handleCopyAllMetadata = async () => {
  const allText = [
    clip.youtubeTitle,
    clip.youtubeDescription,
    youtubeHashtags.join(" "),
  ].filter(Boolean).join("\n\n");

  await handleCopyMetadata("All metadata", allText);
};
```

#### 5.4 DropdownMenu 항목 추가

```tsx
<DropdownMenuItem
  onClick={() => setIsMetadataOpen(true)}
  disabled={!hasMetadata}
  className="cursor-pointer"
>
  <Hash className="mr-2 h-4 w-4" />
  YouTube Metadata
</DropdownMenuItem>
```

#### 5.5 메타데이터 드로어/모달

```tsx
{isMetadataOpen && (
  <div className="fixed inset-0 z-50">
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={() => setIsMetadataOpen(false)}
    />

    <div
      role="dialog"
      aria-modal="true"
      className="bg-background absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border shadow-xl md:inset-y-0 md:right-0 md:bottom-auto md:mx-0 md:h-full md:max-w-md md:rounded-none md:rounded-l-2xl"
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-base font-semibold">YouTube Metadata</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            SEO-optimized for YouTube Shorts
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setIsMetadataOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="title" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="title">
              <Type className="mr-1.5 h-3.5 w-3.5" />
              Title
            </TabsTrigger>
            <TabsTrigger value="description">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Desc
            </TabsTrigger>
            <TabsTrigger value="hashtags">
              <Hash className="mr-1.5 h-3.5 w-3.5" />
              Tags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="title" className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Title</span>
              <span className="text-muted-foreground">
                {clip.youtubeTitle?.length ?? 0}/100
              </span>
            </div>
            <div className="bg-muted/30 rounded-lg border p-3">
              <p className="text-sm">{clip.youtubeTitle || "Not available"}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => handleCopyMetadata("Title", clip.youtubeTitle ?? "")}
            >
              {copiedField === "Title" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy Title
            </Button>
          </TabsContent>

          <TabsContent value="description" className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Description</span>
              <span className="text-muted-foreground">
                {clip.youtubeDescription?.length ?? 0}/5000
              </span>
            </div>
            <div className="bg-muted/30 max-h-48 overflow-auto rounded-lg border p-3">
              <p className="whitespace-pre-wrap text-sm">
                {clip.youtubeDescription || "Not available"}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => handleCopyMetadata("Description", clip.youtubeDescription ?? "")}
            >
              {copiedField === "Description" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy Description
            </Button>
          </TabsContent>

          <TabsContent value="hashtags" className="mt-4 space-y-3">
            <span className="text-sm font-medium">Hashtags ({youtubeHashtags.length})</span>
            <div className="flex flex-wrap gap-2">
              {youtubeHashtags.map((tag, idx) => (
                <button
                  key={idx}
                  onClick={() => handleCopyMetadata(`Tag`, tag)}
                  className="bg-muted hover:bg-muted/80 rounded-full px-3 py-1 text-sm"
                >
                  {tag}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => handleCopyMetadata("Hashtags", youtubeHashtags.join(" "))}
            >
              Copy All Hashtags
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* 푸터 */}
      <div className="flex justify-end gap-2 border-t p-4">
        <Button variant="secondary" size="sm" onClick={handleCopyAllMetadata}>
          <Copy className="mr-2 h-4 w-4" />
          Copy All
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsMetadataOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  </div>
)}
```

---

## 데이터 플로우

```
┌─────────────────────────────────────────────────────────────────┐
│                        VIDEO UPLOAD                              │
│  User uploads MP4 → S3 → processVideo() action                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INNGEST EVENT                                 │
│  "process-video-events" → Modal Backend                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  MODAL BACKEND PROCESSING                        │
│  1. transcribe_video() → 음성 텍스트 변환                         │
│  2. identify_moments() → Q&A 클립 구간 식별                       │
│  3. process_clip() → 각 클립 처리                                 │
│     ├── create_subtitles() → 자막 생성                           │
│     └── generate_youtube_metadata() [NEW]                        │
│         └── Gemini API → 제목/설명/해시태그 생성                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESPONSE TO FRONTEND                          │
│  {                                                               │
│    clips: [{                                                     │
│      s3Key, scriptText,                                          │
│      youtubeTitle,        // NEW                                 │
│      youtubeDescription,  // NEW                                 │
│      youtubeHashtags      // NEW                                 │
│    }]                                                            │
│  }                                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE STORAGE                              │
│  Inngest Worker → db.clip.createMany()                          │
│  youtubeHashtags stored as JSON string                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND DISPLAY                              │
│  ClipCard → "YouTube Metadata" 메뉴                              │
│  → 드로어에서 Title/Description/Hashtags 탭 표시                  │
│  → 각 필드 복사 버튼 제공                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 에러 처리

| 상황 | 대응 방법 |
|------|----------|
| Gemini API 실패 | 빈 메타데이터 반환, 에러 로그 기록 |
| 빈 scriptText | 메타데이터 생성 스킵, 기본값 반환 |
| JSON 파싱 실패 | 기본값 반환, 에러 로그 기록 |
| 글자 수 초과 | 자동 잘라내기 (title: 100자, description: 5000자) |
| 해시태그 15개 초과 | 처음 15개만 저장 |

---

## SEO 최적화 전략

### 제목 (Title)
- 첫 3단어에 핵심 키워드 배치
- 호기심을 자극하는 문구 사용
- 60자 이내 권장 (검색 결과에서 잘리지 않음)
- Power words: "How", "Why", "Secret", "Truth", "비밀", "진짜"

### 설명 (Description)
- 첫 150자가 가장 중요 (검색 미리보기)
- 자연스럽게 키워드 포함
- CTA(Call to Action) 포함: 구독, 좋아요, 댓글

### 해시태그 (Hashtags)
- 인기 해시태그 + 니치 해시태그 조합
- #Shorts 필수 포함 (Short-form 콘텐츠)
- 최대 15개, 권장 5-7개

---

## 테스트 체크리스트

- [ ] Database 마이그레이션 성공
- [ ] 영어 클립 메타데이터 생성 확인
- [ ] 한국어 클립 메타데이터 생성 확인
- [ ] ClipCard에서 메타데이터 드로어 열림
- [ ] 각 필드 복사 기능 동작
- [ ] 전체 복사 기능 동작
- [ ] 빈 scriptText 처리 확인
- [ ] Gemini API 에러 시 graceful fallback 확인
