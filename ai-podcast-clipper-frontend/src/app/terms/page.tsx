import { type Metadata } from "next";
import Link from "next/link";
import SiteFooter from "~/fsd/widgets/site-footer/ui";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "AI Podcast Clipper Terms of Service",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          &larr; AI Podcast Clipper
        </Link>
      </header>

      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Effective date: April 3, 2026
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            1. Service Overview
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            AI Podcast Clipper (the &quot;Service&quot;) is a cloud-based SaaS
            product that analyzes podcast videos uploaded by users and
            automatically generates short-form clips, typically between 30 and
            60 seconds. The Service may use AI and media-processing
            technologies including:
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              Google Gemini 2.5 for highlight detection and YouTube metadata
              generation.
            </li>
            <li>WhisperX for word-level speech transcription.</li>
            <li>
              Columbia ASD active speaker detection for face-track-based video
              cropping.
            </li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Depending on your selected plan and settings, the Service may
            generate multiple clips per upload and may provide captions, script
            text, titles, descriptions, hashtags, and other metadata.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            2. Account and Eligibility
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>The Service uses Google OAuth for account authentication.</li>
            <li>You are responsible for maintaining access to your account.</li>
            <li>
              You may not share, transfer, resell, or misuse your account.
            </li>
            <li>
              You must use the Service only in compliance with applicable laws
              and these Terms.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            3. Credits and Usage
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>New accounts may receive free credits at signup.</li>
            <li>
              Credits are deducted only for clips that are successfully
              generated.
            </li>
            <li>Subscriptions may replenish credits on a recurring basis.</li>
            <li>
              Credits have no cash value and cannot be exchanged, transferred,
              or refunded.
            </li>
            <li>Unused credits may be lost if your account is deleted.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            4. Content Ownership
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              You retain ownership of the original videos and files you upload.
            </li>
            <li>
              You grant us a limited, non-exclusive license to process uploaded
              content solely to provide and operate the Service.
            </li>
            <li>
              Generated clips, transcripts, captions, and metadata are provided
              to you as output from the Service.
            </li>
            <li>
              We do not claim ownership of your uploaded content or generated
              outputs.
            </li>
            <li>
              Transcription text and related metadata may be sent to third-party
              AI providers, including Google Gemini, and processed according to
              their applicable terms and policies.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            5. User Responsibilities and Prohibited Use
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              You must have the rights, permissions, or legal authority needed
              to upload and process any content you submit.
            </li>
            <li>
              We do not independently verify whether uploaded content is
              copyright-compliant.
            </li>
            <li>
              You may not upload illegal, infringing, harmful, deceptive,
              abusive, or privacy-violating content.
            </li>
            <li>
              You are solely responsible for your uploaded content and for any
              use of generated outputs.
            </li>
            <li>
              If we receive a valid infringement notice or determine that
              content violates these Terms, we may remove the content or suspend
              access to it.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            6. AI Processing Notice
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              Clip selection, transcription, captions, metadata generation, and
              cropping may be performed automatically by AI systems.
            </li>
            <li>
              We do not guarantee the accuracy, completeness, or suitability of
              AI-generated results.
            </li>
            <li>
              Active speaker detection is used only for video editing and
              framing purposes. Temporary processing data is not intended to be
              used for identity verification.
            </li>
            <li>
              You should review all generated outputs before publishing,
              distributing, or monetizing them.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            7. Availability and Limitations
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              The Service is provided on an &quot;as is&quot; and
              &quot;as available&quot; basis.
            </li>
            <li>
              The Service depends on third-party infrastructure and APIs,
              including Modal, Google, AWS S3, Neon, Inngest, Polar, and Vercel.
            </li>
            <li>
              Processing times may vary based on file size, queue load, GPU
              availability, network conditions, and third-party service status.
            </li>
            <li>
              We may limit concurrent processing, request volume, upload size,
              or other usage to protect the Service.
            </li>
            <li>
              Failed processing attempts may result in no credit deduction if no
              clip is successfully generated.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            8. Payments and Refunds
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              Payments and subscriptions are processed by Polar. We do not store
              your full payment card information.
            </li>
            <li>
              Subscription benefits remain available until the end of the paid
              billing period unless otherwise stated.
            </li>
            <li>
              Credit purchases and subscription fees are non-refundable unless
              required by law or expressly approved by us.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            9. Disclaimers and Limitation of Liability
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              We make no warranties, express or implied, regarding the Service,
              generated outputs, availability, or fitness for a particular
              purpose.
            </li>
            <li>
              We are not responsible for legal claims, copyright claims, platform
              moderation actions, or monetization decisions arising from your
              uploaded content or generated outputs.
            </li>
            <li>
              To the maximum extent permitted by law, our total liability is
              limited to the fees you paid for the Service during the 12 months
              before the event giving rise to the claim.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            10. Termination and Account Deletion
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>You may request account deletion at any time.</li>
            <li>
              We may suspend or terminate access if you violate these Terms,
              misuse the Service, or create legal or operational risk.
            </li>
            <li>
              Account deletion may remove database records and stored files
              associated with your account, subject to legal retention
              obligations.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            11. Governing Law
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            These Terms are governed by the laws of the Republic of Korea. Any
            dispute relating to the Service will be handled by the competent
            courts located in Seoul, Republic of Korea, unless applicable law
            requires otherwise.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">12. Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For questions about these Terms, contact us at{" "}
            <a
              href="mailto:hamsoo159@gmail.com"
              className="underline underline-offset-4"
            >
              hamsoo159@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
