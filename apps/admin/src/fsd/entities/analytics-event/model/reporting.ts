type AnalyticsReportEvent = {
  name: string;
  anonymousId: string;
  sessionId: string;
  path: string;
  userId: string | null;
  createdAt: Date;
};

function sortEvents(events: AnalyticsReportEvent[]) {
  return [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key);

    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

export function buildOverviewFromEvents(events: AnalyticsReportEvent[]) {
  const anonymousIds = new Set<string>();
  const userIds = new Set<string>();
  const eventsByVisitor = groupBy(events, (event) => event.anonymousId);
  let landingVisitors = 0;
  let landingToDashboardVisitors = 0;

  for (const event of events) {
    anonymousIds.add(event.anonymousId);

    if (event.userId) {
      userIds.add(event.userId);
    }
  }

  for (const visitorEvents of eventsByVisitor.values()) {
    const sorted = sortEvents(visitorEvents);
    const firstLandingIndex = sorted.findIndex(
      (event) => event.name === "landing_view",
    );

    if (firstLandingIndex === -1) {
      continue;
    }

    landingVisitors += 1;

    const reachedDashboard = sorted
      .slice(firstLandingIndex + 1)
      .some((event) => event.name === "dashboard_viewed");

    if (reachedDashboard) {
      landingToDashboardVisitors += 1;
    }
  }

  return {
    uniqueVisitors: anonymousIds.size,
    loggedInUsers: userIds.size,
    totalEvents: events.length,
    dashboardConversionRate:
      landingVisitors === 0
        ? null
        : landingToDashboardVisitors / landingVisitors,
  };
}

export function buildFunnelReportFromEvents(
  events: AnalyticsReportEvent[],
  steps: readonly string[],
) {
  const stepVisitors = steps.map(() => new Set<string>());
  const eventsByVisitor = groupBy(events, (event) => event.anonymousId);

  for (const [visitorKey, visitorEvents] of eventsByVisitor.entries()) {
    const sorted = sortEvents(visitorEvents);
    let nextStepIndex = 0;

    for (const event of sorted) {
      if (event.name !== steps[nextStepIndex]) {
        continue;
      }

      stepVisitors[nextStepIndex]?.add(visitorKey);
      nextStepIndex += 1;

      if (nextStepIndex >= steps.length) {
        break;
      }
    }
  }

  return steps.map((step, index) => {
    const visitors = stepVisitors[index]?.size ?? 0;
    const previousVisitors =
      index === 0 ? null : (stepVisitors[index - 1]?.size ?? 0);
    const dropOffFromPrevious =
      previousVisitors === null ? null : Math.max(previousVisitors - visitors, 0);

    return {
      step,
      visitors,
      conversionFromPrevious:
        previousVisitors === null || previousVisitors === 0
          ? null
          : visitors / previousVisitors,
      dropOffFromPrevious,
      dropOffRateFromPrevious:
        previousVisitors === null || previousVisitors === 0
          ? null
          : (dropOffFromPrevious ?? 0) / previousVisitors,
    };
  });
}

export function buildDropOffReportFromEvents(events: AnalyticsReportEvent[]) {
  const meaningfulEvents = events.filter((event) => event.name !== "page_exited");
  const eventsBySession = groupBy(
    meaningfulEvents,
    (event) => `${event.anonymousId}:${event.sessionId}`,
  );
  const counts = new Map<string, { eventName: string; path: string; sessions: number }>();

  for (const sessionEvents of eventsBySession.values()) {
    const lastEvent = sortEvents(sessionEvents).at(-1);

    if (!lastEvent) {
      continue;
    }

    const key = `${lastEvent.name}\u0000${lastEvent.path}`;
    const existing = counts.get(key);

    if (existing) {
      existing.sessions += 1;
    } else {
      counts.set(key, {
        eventName: lastEvent.name,
        path: lastEvent.path,
        sessions: 1,
      });
    }
  }

  const totalSessions = eventsBySession.size;

  return [...counts.values()]
    .map((row) => ({
      ...row,
      share: totalSessions === 0 ? 0 : row.sessions / totalSessions,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

export function buildRecentFailureEventsFromEvents(
  events: AnalyticsReportEvent[],
  failureNames: readonly string[],
) {
  const failures = new Set(failureNames);
  const counts = new Map<
    string,
    { eventName: string; path: string; count: number; lastSeenAt: Date }
  >();

  for (const event of events) {
    if (!failures.has(event.name)) {
      continue;
    }

    const key = `${event.name}\u0000${event.path}`;
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      if (event.createdAt > existing.lastSeenAt) {
        existing.lastSeenAt = event.createdAt;
      }
    } else {
      counts.set(key, {
        eventName: event.name,
        path: event.path,
        count: 1,
        lastSeenAt: event.createdAt,
      });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
      b.count - a.count ||
      a.eventName.localeCompare(b.eventName),
  );
}
