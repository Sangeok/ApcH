import { redirect } from "next/navigation";
import { resolveUploadDefaults } from "~/fsd/entities/user";
import {
  getUserDefaultCaptionStyle,
  getUserUploadDefaults,
} from "~/fsd/entities/user/server";
import SettingsView from "~/fsd/pages/settings/ui";
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import { auth } from "~/server/auth";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const stored = await getUserUploadDefaults(session.user.id);
  const captionStyles = await getUserDefaultCaptionStyle(session.user.id);

  return (
    <SettingsView
      initialDefaults={resolveUploadDefaults(stored)}
      // 저장 시 captionStyleSchema로 검증된 값(렌더 경로와 같은 캐스트). null = 언어 기본값.
      initialCaptionStyles={{
        english: captionStyles.defaultCaptionStyleEnglish as CaptionStyle | null,
        korean: captionStyles.defaultCaptionStyleKorean as CaptionStyle | null,
      }}
    />
  );
}
