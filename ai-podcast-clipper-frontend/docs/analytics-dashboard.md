# Analytics Dashboard - Feature Development Specification

## Overview

분석 대시보드는 AI Podcast Clipper 사용자에게 사용 통계 및 인사이트를 제공하는 기능입니다. 사용자는 클립 생성 트렌드, 크레딧 사용량, 언어별 분포, 스토리지 사용량 등을 시각적으로 확인할 수 있습니다.

### 핵심 가치

- **투명성**: 사용자가 자신의 서비스 사용 현황을 명확히 파악
- **인사이트**: 데이터 기반의 사용 패턴 분석
- **리소스 관리**: 크레딧 및 스토리지 효율적 관리 지원

### 라우트

- **경로**: `/dashboard/analytics`
- **접근**: 인증된 사용자만 접근 가능

---

## Requirements

### 기능 요구사항

#### FR-1: 사용 통계 (Usage Statistics)

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| FR-1.1 | 총 생성 클립 수 표시 | P0 |
| FR-1.2 | 총 업로드 파일 수 표시 | P0 |
| FR-1.3 | 크레딧 사용량 및 잔여량 표시 | P0 |
| FR-1.4 | 평균 처리 시간 표시 | P1 |
| FR-1.5 | 기간별 트렌드 차트 (7일/30일/90일/전체) | P1 |

#### FR-2: 클립 분석 (Clip Analytics)

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| FR-2.1 | 언어별 클립 분포 (파이 차트) | P0 |
| FR-2.2 | 평균 클립 길이 표시 | P1 |
| FR-2.3 | 처리 상태별 분포 (queued/processing/processed/failed) | P1 |
| FR-2.4 | 성공률/실패율 표시 | P1 |

#### FR-3: 스토리지 사용량 (Storage Usage)

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| FR-3.1 | 총 스토리지 사용량 표시 | P0 |
| FR-3.2 | 파일별 용량 breakdown | P1 |
| FR-3.3 | 원본 vs 클립 스토리지 비율 | P1 |
| FR-3.4 | 스토리지 정리 제안 (오래된 파일) | P2 |

#### FR-4: 차트 시각화 (Visualization)

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| FR-4.1 | 일별 클립 생성 라인 차트 | P0 |
| FR-4.2 | 언어별 분포 파이 차트 | P0 |
| FR-4.3 | 상태별 진행률 바 | P1 |
| FR-4.4 | 스토리지 용량 바 차트 | P1 |

### 비기능 요구사항

| ID | 요구사항 | 기준 |
|----|----------|------|
| NFR-1 | 페이지 로드 시간 | < 2초 |
| NFR-2 | 차트 렌더링 | < 500ms |
| NFR-3 | 반응형 디자인 | 모바일/태블릿/데스크톱 |
| NFR-4 | 접근성 | WCAG 2.1 AA |

---

## Architecture

### FSD Layer 구조

```
src/
├── app/
│   └── dashboard/
│       └── analytics/
│           └── page.tsx                    # [L1] 라우트 페이지
│
└── fsd/
    ├── pages/                              # [L2] 페이지 레이어
    │   └── analytics/
    │       └── ui/
    │           └── index.tsx               # Analytics 페이지 컴포넌트
    │
    ├── widgets/                            # [L3] 위젯 레이어
    │   └── analytics-dashboard/
    │       └── ui/
    │           ├── index.tsx               # 메인 대시보드 컨테이너
    │           └── _component/
    │               ├── StatsOverview.tsx   # 요약 통계 카드
    │               ├── ClipTrendChart.tsx  # 트렌드 라인 차트
    │               ├── LanguageDistribution.tsx  # 언어 파이 차트
    │               ├── ProcessingStats.tsx # 처리 상태 통계
    │               └── StorageUsage.tsx    # 스토리지 사용량
    │
    ├── features/                           # [L4] 피처 레이어
    │   └── analytics/
    │       ├── api/
    │       │   └── index.ts                # Server Actions
    │       ├── model/
    │       │   ├── types.ts                # TypeScript 타입
    │       │   └── schemas.ts              # Zod 스키마
    │       └── lib/
    │           └── storage.ts              # S3 스토리지 유틸
    │
    └── shared/                             # [L5] 공유 레이어
        ├── ui/
        │   └── atoms/
        │       └── chart.tsx               # Recharts 래퍼
        └── api/
            └── s3.ts                       # S3 유틸 (수정)
```

### 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                    /dashboard/analytics                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Analytics Page (Server Component)               │
│  - auth() 인증 확인                                          │
│  - getAnalytics() 호출                                       │
│  - getStorageUsage() 호출                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           AnalyticsDashboard Widget (Client Component)       │
│  - 기간 필터 상태 관리                                        │
│  - 새로고침 핸들링                                            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │StatsOverview│ │ClipTrend    │ │Language     │
      │             │ │Chart        │ │Distribution │
      └─────────────┘ └─────────────┘ └─────────────┘
              │               │               │
              ▼               ▼               ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │Processing   │ │StorageUsage │ │ (추가 가능) │
      │Stats        │ │             │ │             │
      └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Data Models

### TypeScript Interfaces

```typescript
// src/fsd/features/analytics/model/types.ts

/**
 * 분석 기간 필터
 */
export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

/**
 * 요약 통계
 */
export interface AnalyticsSummary {
  totalClips: number;
  totalUploads: number;
  creditsUsed: number;
  creditsRemaining: number;
  averageProcessingTime: number | null; // seconds
  averageClipDuration: number | null; // seconds
  successRate: number; // 0-100
}

/**
 * 트렌드 데이터 포인트
 */
export interface TrendDataPoint {
  date: string; // ISO date string (YYYY-MM-DD)
  clipCount: number;
  uploadCount: number;
  creditsUsed: number;
}

/**
 * 언어별 통계
 */
export interface LanguageStats {
  language: string;
  count: number;
  percentage: number;
}

/**
 * 처리 상태별 통계
 */
export interface StatusStats {
  status: "queued" | "processing" | "processed" | "failed" | "no credits";
  count: number;
  percentage: number;
}

/**
 * 파일별 스토리지 정보
 */
export interface FileStorageInfo {
  fileId: string;
  fileName: string;
  originalSizeBytes: number;
  clipsSizeBytes: number;
  totalSizeBytes: number;
  clipCount: number;
  createdAt: string;
}

/**
 * 스토리지 통계
 */
export interface StorageStats {
  totalBytes: number;
  originalStorageBytes: number;
  clipStorageBytes: number;
  fileBreakdown: FileStorageInfo[];
  cleanupSuggestions: {
    fileId: string;
    fileName: string;
    reason: string;
    potentialSavings: number;
  }[];
}

/**
 * 크레딧 히스토리 항목
 */
export interface CreditHistoryEntry {
  date: string;
  creditsUsed: number;
  balance: number;
  action: "clip_generated" | "credit_purchased" | "credit_expired";
}

/**
 * 전체 분석 데이터 응답
 */
export interface AnalyticsData {
  summary: AnalyticsSummary;
  trendData: TrendDataPoint[];
  languageDistribution: LanguageStats[];
  statusDistribution: StatusStats[];
  creditHistory: CreditHistoryEntry[];
  periodStart: string;
  periodEnd: string;
}
```

### Zod Schemas

```typescript
// src/fsd/features/analytics/model/schemas.ts

import { z } from "zod";

export const analyticsPeriodSchema = z.enum(["7d", "30d", "90d", "all"]);

export const getAnalyticsInputSchema = z.object({
  period: analyticsPeriodSchema.default("30d"),
});

export type GetAnalyticsInput = z.infer<typeof getAnalyticsInputSchema>;
```

### Database Queries (Prisma)

분석 데이터 추출을 위한 주요 쿼리:

```typescript
// 사용자별 클립 통계
const clipStats = await db.clip.aggregate({
  where: { userId },
  _count: true,
  _avg: {
    startSeconds: true,
    endSeconds: true,
  },
});

// 상태별 업로드 분포
const statusDistribution = await db.uploadedFile.groupBy({
  by: ["status"],
  where: { userId, uploaded: true },
  _count: true,
});

// 언어별 분포 (기간 필터 적용)
const languageDistribution = await db.uploadedFile.groupBy({
  by: ["language"],
  where: {
    userId,
    uploaded: true,
    createdAt: { gte: periodStart },
  },
  _count: true,
});

// 일별 클립 생성 트렌드
const dailyClips = await db.clip.groupBy({
  by: ["createdAt"],
  where: {
    userId,
    createdAt: { gte: periodStart, lte: periodEnd },
  },
  _count: true,
});
```

---

## API Design

### Server Actions

```typescript
// src/fsd/features/analytics/api/index.ts

"use server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";
import type {
  AnalyticsData,
  AnalyticsPeriod,
  StorageStats,
} from "../model/types";
import { getAnalyticsInputSchema } from "../model/schemas";

/**
 * 사용자 분석 데이터 조회
 *
 * @param period - 조회 기간 (7d, 30d, 90d, all)
 * @returns 분석 데이터 또는 에러
 */
export async function getAnalytics(
  period: AnalyticsPeriod = "30d"
): Promise<ActionResult<AnalyticsData>> {
  const session = await auth();

  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  const validated = getAnalyticsInputSchema.safeParse({ period });
  if (!validated.success) {
    return failure("Invalid period parameter");
  }

  try {
    const userId = session.user.id;
    const { periodStart, periodEnd } = calculatePeriodRange(period);

    // 병렬 데이터 조회
    const [user, clipStats, uploadStats, dailyTrend] = await Promise.all([
      getUserWithCredits(userId),
      getClipStatistics(userId, periodStart),
      getUploadStatistics(userId, periodStart),
      getDailyTrendData(userId, periodStart, periodEnd),
    ]);

    // 요약 통계 계산
    const summary = calculateSummary(user, clipStats, uploadStats);

    // 분포 데이터 계산
    const languageDistribution = calculateLanguageDistribution(uploadStats.byLanguage);
    const statusDistribution = calculateStatusDistribution(uploadStats.byStatus);

    // 크레딧 히스토리 계산
    const creditHistory = calculateCreditHistory(clipStats.dailyClips, periodStart);

    return success({
      summary,
      trendData: dailyTrend,
      languageDistribution,
      statusDistribution,
      creditHistory,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Failed to get analytics:", error);
    return failure("Failed to load analytics data");
  }
}

/**
 * S3 스토리지 사용량 조회
 *
 * @returns 스토리지 통계 또는 에러
 */
export async function getStorageUsage(): Promise<ActionResult<StorageStats>> {
  const session = await auth();

  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  try {
    const userId = session.user.id;

    // DB에서 사용자 파일 목록 조회
    const uploadedFiles = await db.uploadedFile.findMany({
      where: { userId, uploaded: true },
      select: {
        id: true,
        s3Key: true,
        displayName: true,
        createdAt: true,
        clips: {
          select: { s3Key: true },
        },
      },
    });

    // S3에서 각 파일의 실제 크기 조회
    const fileBreakdown = await calculateFileStorageBreakdown(userId, uploadedFiles);

    // 총 용량 계산
    const totalBytes = fileBreakdown.reduce((sum, f) => sum + f.totalSizeBytes, 0);
    const originalStorageBytes = fileBreakdown.reduce((sum, f) => sum + f.originalSizeBytes, 0);
    const clipStorageBytes = fileBreakdown.reduce((sum, f) => sum + f.clipsSizeBytes, 0);

    // 정리 제안 생성
    const cleanupSuggestions = generateCleanupSuggestions(fileBreakdown);

    return success({
      totalBytes,
      originalStorageBytes,
      clipStorageBytes,
      fileBreakdown,
      cleanupSuggestions,
    });
  } catch (error) {
    console.error("Failed to get storage usage:", error);
    return failure("Failed to load storage data");
  }
}

// === Helper Functions ===

function calculatePeriodRange(period: AnalyticsPeriod): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodEnd = new Date();
  let periodStart: Date;

  switch (period) {
    case "7d":
      periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      periodStart = new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      periodStart = new Date(0);
      break;
  }

  return { periodStart, periodEnd };
}

// 추가 헬퍼 함수들은 구현 시 상세화
```

### S3 스토리지 유틸리티

```typescript
// src/fsd/features/analytics/lib/storage.ts

import { ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "~/fsd/shared/api/s3";
import { env } from "~/env";

/**
 * S3 객체 크기 조회
 */
export async function getObjectSize(s3Key: string): Promise<number> {
  try {
    const command = new HeadObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    return response.ContentLength ?? 0;
  } catch (error) {
    console.error(`Failed to get size for ${s3Key}:`, error);
    return 0;
  }
}

/**
 * 사용자 폴더의 모든 객체 크기 조회
 */
export async function getUserStorageSize(userId: string): Promise<{
  totalBytes: number;
  objects: { key: string; size: number }[];
}> {
  const objects: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;
  let totalBytes = 0;

  do {
    const command = new ListObjectsV2Command({
      Bucket: env.S3_BUCKET_NAME,
      Prefix: `${userId}/`,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Size) {
          objects.push({ key: obj.Key, size: obj.Size });
          totalBytes += obj.Size;
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return { totalBytes, objects };
}

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}
```

---

## UI Components

### 1. AnalyticsDashboard (메인 컨테이너)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/index.tsx`

```tsx
"use client";

import type { AnalyticsData, StorageStats, AnalyticsPeriod } from "~/fsd/features/analytics/model/types";
import { useState, useTransition } from "react";
import { getAnalytics } from "~/fsd/features/analytics/api";
import { StatsOverview } from "./_component/StatsOverview";
import { ClipTrendChart } from "./_component/ClipTrendChart";
import { LanguageDistribution } from "./_component/LanguageDistribution";
import { ProcessingStats } from "./_component/ProcessingStats";
import { StorageUsage } from "./_component/StorageUsage";
import { Card, CardContent } from "~/fsd/shared/ui/atoms/card";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Loader2, RefreshCw } from "lucide-react";

interface AnalyticsDashboardProps {
  initialData: AnalyticsData;
  storageData: StorageStats | null;
}

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "90d", label: "90일" },
  { value: "all", label: "전체" },
];

export default function AnalyticsDashboard({
  initialData,
  storageData,
}: AnalyticsDashboardProps) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (newPeriod: AnalyticsPeriod) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      const result = await getAnalytics(newPeriod);
      if (result.success) {
        setData(result.data);
      }
    });
  };

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await getAnalytics(period);
      if (result.success) {
        setData(result.data);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 헤더 + 기간 필터 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            사용 통계 및 인사이트
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 기간 선택 버튼 그룹 */}
          <div className="flex rounded-md border">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={period === option.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handlePeriodChange(option.value)}
                disabled={isPending}
                className="rounded-none first:rounded-l-md last:rounded-r-md"
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* 새로고침 버튼 */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 요약 통계 카드 */}
      <StatsOverview summary={data.summary} />

      {/* 차트 그리드 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 트렌드 차트 (전체 너비) */}
        <Card className="lg:col-span-2">
          <ClipTrendChart data={data.trendData} />
        </Card>

        {/* 언어 분포 */}
        <Card>
          <LanguageDistribution data={data.languageDistribution} />
        </Card>

        {/* 처리 상태 */}
        <Card>
          <ProcessingStats
            data={data.statusDistribution}
            averageTime={data.summary.averageProcessingTime}
          />
        </Card>

        {/* 스토리지 사용량 */}
        {storageData && (
          <Card className="lg:col-span-2">
            <StorageUsage data={storageData} />
          </Card>
        )}
      </div>
    </div>
  );
}
```

### 2. StatsOverview (요약 카드)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/_component/StatsOverview.tsx`

**레이아웃**: 6개의 메트릭 카드 그리드

```
┌─────────────┬─────────────┬─────────────┐
│  총 클립 수  │ 총 업로드 수 │ 사용 크레딧  │
│     127     │     45      │     89      │
└─────────────┴─────────────┴─────────────┘
┌─────────────┬─────────────┬─────────────┐
│ 잔여 크레딧  │ 평균 클립길이 │ 평균 처리시간 │
│     11      │    52초     │   3분 24초   │
└─────────────┴─────────────┴─────────────┘
```

### 3. ClipTrendChart (트렌드 차트)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/_component/ClipTrendChart.tsx`

**차트 타입**: Line Chart (Recharts)

```
클립 생성 트렌드
    │
  8 ┤                    ●
  6 ┤        ●──●       / \
  4 ┤   ●───●    \●────●   \
  2 ┤  /                    \●
  0 ┼──┴────┴────┴────┴────┴──
    1/1  1/7  1/14 1/21 1/28
```

### 4. LanguageDistribution (언어 분포)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/_component/LanguageDistribution.tsx`

**차트 타입**: Pie Chart (Recharts)

```
언어별 분포
    ┌─────────────────┐
    │    ┌─────┐      │
    │   ╱ Eng  ╲     │  ● English: 65%
    │  │  65%  │     │  ● Korean: 35%
    │   ╲ Kor ╱      │
    │    └─────┘      │
    └─────────────────┘
```

### 5. ProcessingStats (처리 상태)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/_component/ProcessingStats.tsx`

**레이아웃**: 상태별 진행률 바

```
처리 상태
┌──────────────────────────────────┐
│ Processed  ████████████████ 80% │
│ Processing ██               5%  │
│ Queued     ██               5%  │
│ Failed     ████            10%  │
└──────────────────────────────────┘
평균 처리 시간: 3분 24초
```

### 6. StorageUsage (스토리지)

**파일**: `src/fsd/widgets/analytics-dashboard/ui/_component/StorageUsage.tsx`

**레이아웃**: 스토리지 요약 + 파일 테이블

```
스토리지 사용량
┌──────────────────────────────────────┐
│ 총 사용량: 2.4 GB                    │
│ ████████████████████░░░░░░░░░░ 75%   │
│                                      │
│ ● 원본 파일: 1.8 GB (75%)            │
│ ● 클립: 600 MB (25%)                 │
└──────────────────────────────────────┘

파일별 용량
┌──────────┬──────────┬───────┬────────┐
│ 파일명    │ 원본     │ 클립  │ 총 용량 │
├──────────┼──────────┼───────┼────────┤
│ podcast1 │ 450 MB   │ 120MB │ 570 MB │
│ podcast2 │ 380 MB   │  95MB │ 475 MB │
└──────────┴──────────┴───────┴────────┘

정리 제안
- podcast_old.mp4: 30일 이상 미사용 (150 MB 절약 가능)
```

### 7. Chart 래퍼 컴포넌트

**파일**: `src/fsd/shared/ui/atoms/chart.tsx`

```tsx
"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "~/fsd/shared/lib/utils";

// 차트 색상 팔레트 (globals.css의 CSS 변수 활용)
export const CHART_COLORS = [
  "hsl(221, 83%, 53%)",  // --chart-1: 파랑
  "hsl(142, 71%, 45%)",  // --chart-2: 초록
  "hsl(48, 96%, 53%)",   // --chart-3: 노랑
  "hsl(280, 65%, 60%)",  // --chart-4: 보라
  "hsl(0, 72%, 51%)",    // --chart-5: 빨강
];

interface ChartContainerProps {
  children: React.ReactNode;
  className?: string;
  height?: number;
}

export function ChartContainer({
  children,
  className,
  height = 300,
}: ChartContainerProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// 커스텀 툴팁
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background rounded-lg border p-3 shadow-lg">
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">
            {entry.name}: <strong>{entry.value}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

// Recharts 컴포넌트 re-export
export {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
};
```

---

## Implementation Guide

### Phase 1: 기반 설정 (1일차)

#### Step 1.1: 패키지 설치

```bash
npm install recharts
```

#### Step 1.2: 타입 및 스키마 생성

1. `src/fsd/features/analytics/model/types.ts` 생성
2. `src/fsd/features/analytics/model/schemas.ts` 생성

#### Step 1.3: Chart 래퍼 컴포넌트

1. `src/fsd/shared/ui/atoms/chart.tsx` 생성

### Phase 2: 데이터 레이어 (2일차)

#### Step 2.1: S3 스토리지 유틸리티

1. `src/fsd/features/analytics/lib/storage.ts` 생성
2. `src/fsd/shared/api/s3.ts`에 `getObjectSize`, `listUserObjects` 함수 추가

#### Step 2.2: Server Actions 구현

1. `src/fsd/features/analytics/api/index.ts` 생성
2. `getAnalytics()` 함수 구현
3. `getStorageUsage()` 함수 구현

### Phase 3: UI 컴포넌트 (3-4일차)

#### Step 3.1: 요약 카드

1. `src/fsd/widgets/analytics-dashboard/ui/_component/StatsOverview.tsx`

#### Step 3.2: 차트 컴포넌트

1. `ClipTrendChart.tsx` - 라인 차트
2. `LanguageDistribution.tsx` - 파이 차트
3. `ProcessingStats.tsx` - 진행률 바
4. `StorageUsage.tsx` - 스토리지 바 + 테이블

#### Step 3.3: 메인 대시보드

1. `src/fsd/widgets/analytics-dashboard/ui/index.tsx`

### Phase 4: 라우트 통합 (5일차)

#### Step 4.1: Analytics 라우트 생성

```tsx
// src/app/dashboard/analytics/page.tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { getAnalytics, getStorageUsage } from "~/fsd/features/analytics/api";
import AnalyticsDashboard from "~/fsd/widgets/analytics-dashboard/ui";

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [analyticsResult, storageResult] = await Promise.all([
    getAnalytics("30d"),
    getStorageUsage(),
  ]);

  if (!analyticsResult.success) {
    // 에러 처리
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AnalyticsDashboard
        initialData={analyticsResult.data}
        storageData={storageResult.success ? storageResult.data : null}
      />
    </div>
  );
}
```

#### Step 4.2: 네비게이션 링크 추가

기존 대시보드 헤더 또는 사이드바에 Analytics 링크 추가.

### Phase 5: 테스트 및 마무리 (6일차)

1. 반응형 디자인 검증 (모바일/태블릿)
2. 빈 데이터 상태 처리
3. 로딩 상태 및 에러 처리
4. 성능 최적화 (캐싱, 병렬 쿼리)

---

## Dependencies

### 신규 패키지

```json
{
  "dependencies": {
    "recharts": "^2.12.0"
  }
}
```

### 기존 패키지 (이미 설치됨)

- `@aws-sdk/client-s3` - S3 API
- `zod` - 스키마 검증
- `lucide-react` - 아이콘
- `next` - 프레임워크
- `prisma` - ORM

---

## File Checklist

### 신규 생성 파일

- [ ] `src/fsd/features/analytics/model/types.ts`
- [ ] `src/fsd/features/analytics/model/schemas.ts`
- [ ] `src/fsd/features/analytics/api/index.ts`
- [ ] `src/fsd/features/analytics/lib/storage.ts`
- [ ] `src/fsd/shared/ui/atoms/chart.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/index.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/_component/StatsOverview.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/_component/ClipTrendChart.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/_component/LanguageDistribution.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/_component/ProcessingStats.tsx`
- [ ] `src/fsd/widgets/analytics-dashboard/ui/_component/StorageUsage.tsx`
- [ ] `src/app/dashboard/analytics/page.tsx`

### 수정 파일

- [ ] `package.json` (recharts 추가)
- [ ] `src/fsd/shared/api/s3.ts` (스토리지 조회 함수 추가)

---

## References

### 기존 코드 참조

| 파일 | 참조 내용 |
|------|----------|
| `src/fsd/pages/dashboard/ui/index.tsx` | 대시보드 레이아웃 패턴 |
| `src/fsd/features/upload/api/index.ts` | Server Action 패턴 |
| `src/fsd/shared/api/result.ts` | ActionResult 타입 |
| `src/fsd/shared/api/s3.ts` | S3 클라이언트 패턴 |
| `prisma/schema.prisma` | DB 스키마 |

### 외부 문서

- [Recharts Documentation](https://recharts.org/)
- [AWS S3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [Feature-Sliced Design](https://feature-sliced.design/)
