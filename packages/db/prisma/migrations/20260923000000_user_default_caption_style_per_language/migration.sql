-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultCaptionStyleEnglish" JSONB;
ALTER TABLE "User" ADD COLUMN "defaultCaptionStyleKorean" JSONB;

-- 기존 값을 사용자의 기본 언어 쪽으로 옮긴다.
-- defaultLanguage가 NULL이면 시스템 기본(English, constants.ts DEFAULT_LANGUAGE)을 따른다.
UPDATE "User"
   SET "defaultCaptionStyleKorean" = "defaultCaptionStyle"
 WHERE "defaultCaptionStyle" IS NOT NULL
   AND "defaultLanguage" = 'Korean';

UPDATE "User"
   SET "defaultCaptionStyleEnglish" = "defaultCaptionStyle"
 WHERE "defaultCaptionStyle" IS NOT NULL
   AND ("defaultLanguage" IS NULL OR "defaultLanguage" <> 'Korean');
