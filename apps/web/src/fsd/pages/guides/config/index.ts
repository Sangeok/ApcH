import type { GuidePageData } from "../model/types";

export const guidePages: GuidePageData[] = [
  {
    slug: "how-to-make-podcast-clips-for-youtube-shorts",
    title: "How to Make Podcast Clips for YouTube Shorts",
    description:
      "A practical workflow for turning long podcast episodes into self-contained YouTube Shorts with captions, vertical framing, and creator review.",
    primaryIntent: "Podcast clipping workflow",
    updatedAt: "2026-06-15",
    readingTime: "7 min",
    sections: [
      {
        title: "Start with moments, not timestamps",
        paragraphs: [
          "A strong podcast Short is not just a random 60 second slice. It needs a hook, enough context, a clear point, and a payoff that a new viewer can understand without watching the full episode.",
          "Before editing, scan for questions, claims, disagreements, surprising facts, or concise stories. These moments tend to survive outside the episode better than loose transitions or setup-heavy sections.",
        ],
        bullets: [
          "Look for one idea per clip.",
          "Avoid clips that require long backstory.",
          "Prefer clean speaker turns and clear audio.",
        ],
      },
      {
        title: "Manual workflow",
        paragraphs: [
          "The manual process usually means watching the episode, marking timestamps, cutting the source, cropping to 9:16, adding captions, checking timing, exporting, and naming the file for publishing.",
          "That gives full creative control, but the cost rises quickly when a creator wants several clips from every episode.",
        ],
      },
      {
        title: "AI-assisted workflow",
        paragraphs: [
          "AI Podcast Clipper compresses the first pass. Upload the podcast .mp4, choose the caption language and clip count, process the file, then review the generated vertical clips in the dashboard.",
          "The creator still makes the publishing decision. The useful shift is that the first review surface is a rendered clip, not a blank timeline.",
        ],
      },
    ],
    checklist: [
      "Confirm the source video is an .mp4 under the upload limit.",
      "Choose English or Korean captions before processing.",
      "Review each generated clip for context and rights.",
      "Download only the clips that match the publishing channel.",
      "Write a platform-specific title and description before publishing.",
    ],
    faq: [
      {
        question: "Can I make Shorts from any podcast episode?",
        answer:
          "Technically the app accepts podcast-style .mp4 uploads, but the best results come from clear audio, visible speakers, and self-contained discussion moments.",
      },
      {
        question: "Does the app upload to YouTube automatically?",
        answer:
          "No. It generates clips for review and download. The creator chooses what to publish.",
      },
    ],
    relatedPaths: [
      { label: "See podcast to Shorts page", href: "/podcast-to-shorts" },
      { label: "See product tour", href: "/product-tour" },
      { label: "Read how it works", href: "/how-it-works" },
    ],
  },
  {
    slug: "best-podcast-clip-length-for-shorts",
    title: "Best Podcast Clip Length for Shorts",
    description:
      "How to think about 30, 40, and 60 second podcast clips for YouTube Shorts, Reels, and TikTok.",
    primaryIntent: "Clip length strategy",
    updatedAt: "2026-06-15",
    readingTime: "6 min",
    sections: [
      {
        title: "Use the shortest length that keeps the idea intact",
        paragraphs: [
          "Shorter is not automatically better. A 20 second clip can feel empty if the audience never hears the setup. A 60 second clip can work if every sentence moves the viewer toward the payoff.",
          "For podcast conversations, 40-60 seconds is often a useful working range because the viewer needs both the question and the answer.",
        ],
      },
      {
        title: "When 30 seconds works",
        paragraphs: [
          "Thirty seconds works best for sharp claims, punchy answers, quick disagreements, or moments where the setup is already obvious from the first sentence.",
        ],
        bullets: [
          "One speaker carries most of the idea.",
          "The hook appears in the first 2-3 seconds.",
          "No extra guest backstory is required.",
        ],
      },
      {
        title: "When 60 seconds works",
        paragraphs: [
          "Sixty seconds works when the answer needs a turn, contrast, or explanation. Many podcast highlights need the question, a short setup, and the payoff to feel complete.",
          "AI Podcast Clipper targets 40-60 second Q&A-style moments because that range usually preserves enough context for conversation clips.",
        ],
      },
    ],
    checklist: [
      "Keep one main idea per clip.",
      "Make sure the first sentence gives a reason to keep watching.",
      "Cut dead air and filler when possible.",
      "Check caption density on mobile.",
      "Review whether the ending lands without the full episode.",
    ],
    faq: [
      {
        question: "Is 60 seconds too long for a Short?",
        answer:
          "Not if the clip has a clear hook, useful context, and a payoff. Long clips fail when they drift, not because they cross a specific number.",
      },
      {
        question: "Does AI Podcast Clipper always choose the same duration?",
        answer:
          "No. Clips are selected within the product's supported range and depend on source structure and selected settings.",
      },
    ],
    relatedPaths: [
      { label: "YouTube Shorts generator", href: "/youtube-shorts-generator" },
      { label: "Podcast to Shorts workflow", href: "/podcast-to-shorts" },
      { label: "See product tour", href: "/product-tour" },
    ],
  },
  {
    slug: "podcast-clips-with-captions",
    title: "Podcast Clips With Captions",
    description:
      "Why burned-in captions matter for podcast clips and what to check before publishing captioned Shorts.",
    primaryIntent: "Captioned podcast clips",
    updatedAt: "2026-06-15",
    readingTime: "6 min",
    sections: [
      {
        title: "Captions are part of the creative surface",
        paragraphs: [
          "Podcast clips often rely on spoken nuance. Many viewers watch short-form video with audio low or muted, so captions become the main reading surface.",
          "Caption quality affects retention, accessibility, and whether the clip can be understood in a feed environment.",
        ],
      },
      {
        title: "Timing matters more than decoration",
        paragraphs: [
          "Large text and bold styling help, but timing is the first requirement. Captions that lag behind the speaker make a clip feel broken even when the words are technically correct.",
          "AI Podcast Clipper uses transcript timing and renders captions directly into the output so the review file matches the publishable file.",
        ],
      },
      {
        title: "Language selection",
        paragraphs: [
          "The product supports English or Korean captions selected per processing run. Pick the language based on the target audience for that batch of clips.",
        ],
        bullets: [
          "Use English for English-speaking channels and source review.",
          "Use Korean when the publishing channel targets Korean viewers.",
          "Review translations before publishing important claims.",
        ],
      },
    ],
    checklist: [
      "Play the clip on a phone-sized viewport.",
      "Check that captions do not cover the face or main subject.",
      "Listen for names, numbers, and technical terms.",
      "Confirm the selected language matches the channel audience.",
      "Review the final rendered video, not only transcript text.",
    ],
    faq: [
      {
        question: "Are captions burned into the video?",
        answer:
          "Yes. AI Podcast Clipper renders captions into the vertical mp4 output so the clip can be reviewed as a final media file.",
      },
      {
        question: "Can I generate Korean captions?",
        answer:
          "Yes. The product supports Korean captions selected per processing run.",
      },
    ],
    relatedPaths: [
      { label: "Pricing and credits", href: "/pricing" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Security notes", href: "/security" },
    ],
  },
  {
    slug: "turn-long-form-video-into-shorts",
    title: "Turn Long-Form Video Into Shorts",
    description:
      "A practical way to repurpose long-form podcast video into short-form clips without starting every edit from a blank timeline.",
    primaryIntent: "Long-form repurposing",
    updatedAt: "2026-06-15",
    readingTime: "7 min",
    sections: [
      {
        title: "Repurposing starts with selection",
        paragraphs: [
          "The hard part of long-form repurposing is not only cutting. It is deciding which moments deserve a separate life outside the original video.",
          "Podcast episodes contain setup, transitions, asides, and deep context. Shorts need tighter ideas and fewer dependencies.",
        ],
      },
      {
        title: "Use AI for the first pass",
        paragraphs: [
          "An AI-assisted first pass can identify candidate highlights, render them vertically, and add captions so the creator can review actual outputs instead of raw timestamps.",
          "That does not remove human judgment. It changes the starting point from manual scanning to clip review.",
        ],
      },
      {
        title: "Keep the source context available",
        paragraphs: [
          "When reviewing generated clips, keep the source episode nearby. If a clip makes a strong claim, verify that the surrounding context does not change the meaning.",
        ],
      },
    ],
    checklist: [
      "Pick long-form sources with clear topics and clean audio.",
      "Generate several candidate clips before deciding what to publish.",
      "Reject clips that need too much missing context.",
      "Adjust titles and descriptions for each platform.",
      "Track which clips drive watch time and repeat the pattern.",
    ],
    faq: [
      {
        question: "Can this workflow work outside podcasts?",
        answer:
          "It can process .mp4 files, but the product is optimized around conversation and podcast-style source material.",
      },
      {
        question: "Should I publish every generated clip?",
        answer:
          "No. Generated clips are review candidates. Publish only clips that pass context, rights, and quality checks.",
      },
    ],
    relatedPaths: [
      { label: "Product tour", href: "/product-tour" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Podcast clip maker features", href: "/features" },
    ],
  },
  {
    slug: "repurpose-podcast-content",
    title: "Repurpose Podcast Content Into Short-Form Clips",
    description:
      "How podcast creators can turn one long episode into multiple short-form assets while preserving context and review quality.",
    primaryIntent: "Podcast repurposing",
    updatedAt: "2026-06-15",
    readingTime: "7 min",
    sections: [
      {
        title: "Think in assets, not only clips",
        paragraphs: [
          "A podcast episode can become short clips, show notes, quote posts, newsletter sections, and episode teasers. The clip is usually the highest-effort asset because it needs selection, framing, captions, and export.",
          "Start with a small repeatable workflow: generate clips, review the strongest moments, then adapt the message for each channel.",
        ],
      },
      {
        title: "Create a review loop",
        paragraphs: [
          "Repurposing works when the creator can compare candidates quickly. A dashboard of rendered clips is easier to judge than a list of timestamps.",
          "Use AI Podcast Clipper to create reviewable outputs, then keep, download, or delete the ones that do not fit.",
        ],
      },
      {
        title: "Preserve the original meaning",
        paragraphs: [
          "Short-form clips travel farther than the original episode. Before posting, confirm the selected moment does not remove a necessary qualifier or make the guest sound more absolute than they were.",
        ],
      },
    ],
    checklist: [
      "Select episodes with evergreen topics.",
      "Create clips around one question or claim.",
      "Keep titles platform-specific.",
      "Use captions for viewers watching without sound.",
      "Record which source episodes generate the best clips.",
    ],
    faq: [
      {
        question: "How many clips should I make from one episode?",
        answer:
          "Start with a small batch. AI Podcast Clipper supports 1-4 clips per upload, which is enough to review quality without overwhelming the creator.",
      },
      {
        question: "Is repurposing the same as reposting?",
        answer:
          "No. Repurposing adapts the original conversation into a format that works in a different feed and viewing context.",
      },
    ],
    relatedPaths: [
      { label: "AI podcast clipper", href: "/ai-podcast-clipper" },
      { label: "Podcast to Shorts", href: "/podcast-to-shorts" },
      { label: "Product tour", href: "/product-tour" },
    ],
  },
  {
    slug: "youtube-shorts-for-podcast-hosts",
    title: "YouTube Shorts for Podcast Hosts",
    description:
      "A podcast host checklist for choosing moments, reviewing captions, and publishing Shorts from long-form episodes.",
    primaryIntent: "Podcast host Shorts checklist",
    updatedAt: "2026-06-15",
    readingTime: "6 min",
    sections: [
      {
        title: "Pick moments that introduce the show",
        paragraphs: [
          "A Short may be a viewer's first contact with the podcast. Choose moments that communicate the show's voice, topic, and value without requiring a long introduction.",
          "Good candidates include a guest's strongest answer, a host's concise framing, a surprising statistic, or a clear disagreement that resolves quickly.",
        ],
      },
      {
        title: "Review the host and guest balance",
        paragraphs: [
          "Podcast clips often work best when the host sets up the question and the guest carries the insight. If the clip starts too late, the answer may feel disconnected. If it starts too early, the Short may drag.",
        ],
      },
      {
        title: "Publish with context",
        paragraphs: [
          "Use the title, caption, and description to clarify the episode topic. Link back to the full episode when possible so the Short becomes discovery, not a detached fragment.",
        ],
      },
    ],
    checklist: [
      "Open with a clear question, claim, or tension.",
      "Keep the clip focused on one idea.",
      "Check that the speaker's face and captions are readable.",
      "Avoid clips that misrepresent the guest.",
      "Point viewers to the full episode when the platform allows it.",
    ],
    faq: [
      {
        question: "Should podcast hosts post clips from every episode?",
        answer:
          "Not automatically. Some episodes produce stronger standalone moments than others. Review each generated clip before publishing.",
      },
      {
        question: "Can Shorts help a podcast grow?",
        answer:
          "They can help discovery when the clip is self-contained, captioned, and connected back to the full show.",
      },
    ],
    relatedPaths: [
      { label: "YouTube Shorts generator", href: "/youtube-shorts-generator" },
      {
        label: "Best clip length guide",
        href: "/guides/best-podcast-clip-length-for-shorts",
      },
      { label: "View product tour", href: "/product-tour" },
    ],
  },
];

export function getGuideBySlug(slug: string) {
  return guidePages.find((guide) => guide.slug === slug);
}
