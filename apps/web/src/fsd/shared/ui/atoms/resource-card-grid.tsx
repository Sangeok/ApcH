import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

/** 아이콘 + 제목 + 설명 카드. 다섯 마케팅 라우트가 함께 쓴다. */
export interface ResourceCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface ProcessStep {
  title: string;
  description: string;
}

export interface ChangelogEntry {
  date: string;
  title: string;
  changes: string[];
}

/**
 * 세 칸 카드 그리드.
 *
 * `pages/resources`가 라우트 다섯의 페이지 컴포넌트를 한 파일에 담고 있어서
 * 이 그리드가 그 파일 안의 비공개 헬퍼였다. 슬라이스를 라우트별로 나누면서
 * 유일한 실제 공유물인 이것만 shared로 올린다.
 */
export function ResourceCardGrid({ cards }: { cards: ResourceCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title} className="h-full px-2 py-4">
          <CardHeader>
            <div className="text-primary flex items-center gap-3">
              <card.icon className="size-5" />
              <CardTitle className="text-lg">{card.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
