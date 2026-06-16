"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import type { AnalyticsEventName } from "../event-catalog";
import { trackAnalyticsEvent } from "../lib/track-event";

type TrackedLinkProps = ComponentProps<typeof Link> & {
  eventName?: AnalyticsEventName;
  metadata?: Record<string, unknown>;
};

export function TrackedLink({
  eventName = "cta_clicked",
  metadata,
  onClick,
  ...props
}: TrackedLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      void trackAnalyticsEvent(eventName, metadata);
    }
  };

  return <Link onClick={handleClick} {...props} />;
}
