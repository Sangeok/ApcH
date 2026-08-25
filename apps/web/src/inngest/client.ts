import { EventSchemas, Inngest } from "inngest";
import type { CaptionStyle } from "~/fsd/shared/config/constants";

type ProcessVideoBackendClip = {
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

// 캡션 계약의 원천은 shared/config의 CaptionStyle 단일 타입이다.
// 여기서는 wire 명칭만 별칭으로 유지한다 (스키마-이벤트-디스패처 드리프트 방지).
export type RenderCaptionStyle = CaptionStyle;

type RenderMoment = {
  index: number;
  start: number;
  end: number;
  type?: string | null;
  hook?: string | null;
  payoff?: string | null;
  // 백엔드 ProcessVideoRequest.moments[].caption_style와 동일 키 (snake_case 유지)
  caption_style?: RenderCaptionStyle | null;
};

// 분석 결과 moment의 canonical 형태. 웹훅 정규화 출력(route.ts)과
// analyzeVideo의 wire 타입(Partial<AnalyzedMoment>)이 모두 이 타입에서 파생된다.
export type AnalyzedMoment = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
};

type Events = {
  "process-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
      // render dispatch만 설정. 있으면 Modal에 mode="render"로 전달된다.
      moments?: RenderMoment[];
      transcriptS3Key?: string | null;
    };
  };
  "analyze-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
    };
  };
  "process-video-events/cancel": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
    };
  };
  "modal/video.processed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      clips?: ProcessVideoBackendClip[];
      error?: string;
    };
  };
  "modal/video.analyzed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      moments?: AnalyzedMoment[];
      transcriptS3Key?: string | null;
      error?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
