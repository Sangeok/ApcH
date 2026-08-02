import type { ComparePageData } from "../model/types";

export const manualEditingComparison: ComparePageData = {
  slug: "manual-editing-vs-ai-podcast-clipping",
  title: "Manual Editing vs AI Podcast Clipping",
  description:
    "Compare manual short-form editing with an AI-assisted podcast clipping workflow for long-form conversation episodes.",
  href: "/compare/manual-editing-vs-ai-podcast-clipping",
  rows: [
    {
      criterion: "Starting point",
      manual:
        "The creator watches the source, marks timestamps, cuts the clip, crops, captions, exports, and reviews.",
      aiAssisted:
        "The creator uploads once, processes the file, then reviews rendered vertical clip candidates.",
    },
    {
      criterion: "Creative control",
      manual:
        "Highest control over every frame, cut, caption, and pacing decision.",
      aiAssisted:
        "Faster first pass, but the creator still decides what to keep, publish, or discard.",
    },
    {
      criterion: "Best fit",
      manual:
        "High-stakes edits, brand campaigns, custom pacing, or clips that need detailed narrative shaping.",
      aiAssisted:
        "Recurring podcast episodes where the main bottleneck is finding and rendering reviewable candidates.",
    },
    {
      criterion: "Review responsibility",
      manual:
        "The editor reviews each timeline and export before handoff or publishing.",
      aiAssisted:
        "The creator reviews context, rights, caption accuracy, and brand fit before publishing.",
    },
  ],
  faq: [
    {
      question: "Does AI Podcast Clipper replace a human editor?",
      answer:
        "No. It is best understood as an AI-assisted first pass for finding and rendering candidate clips. Human review is still required before publishing.",
    },
    {
      question: "When is manual editing still better?",
      answer:
        "Manual editing is better when a clip needs precise creative pacing, custom graphics, sensitive context handling, or a campaign-level finish.",
    },
    {
      question: "When is AI-assisted clipping useful?",
      answer:
        "It is useful when a creator regularly publishes podcast episodes and needs a faster way to find, caption, frame, and review several candidate clips.",
    },
  ],
};

export const comparePages = [manualEditingComparison] as const;
