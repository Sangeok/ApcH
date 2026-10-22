import "server-only";
import { env } from "~/env";
import { canAcceptCardNews } from "~/fsd/shared/config/card-news";

/**
 * Whether this user can use card news at all. Entry points (dashboard header, dashboard tab)
 * use the same admission as the clip's "Create card news" button, so a disabled flag never
 * leaves a link to a feature the user cannot reach (FEAT-63).
 */
export function canUserAccessCardNews(userId: string): boolean {
  return canAcceptCardNews(
    {
      enabled: env.CARD_NEWS_ENABLED,
      allowedUserIds: env.CARD_NEWS_ALLOWED_USER_IDS,
      endpoint: env.CARD_NEWS_ENDPOINT,
      endpointAuth: env.CARD_NEWS_ENDPOINT_AUTH,
      webhookSecret: env.CARD_NEWS_WEBHOOK_SECRET,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
    },
    userId,
  );
}
