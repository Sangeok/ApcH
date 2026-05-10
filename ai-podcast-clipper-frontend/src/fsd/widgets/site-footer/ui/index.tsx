import Link from "next/link";

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Product tour", href: "/product-tour" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "AI Podcast Clipper", href: "/ai-podcast-clipper" },
      { label: "Podcast to Shorts", href: "/podcast-to-shorts" },
      { label: "YouTube Shorts Generator", href: "/youtube-shorts-generator" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
] as const;

export default function SiteFooter() {
  return (
    <footer className="text-muted-foreground mt-16 border-t pt-10 text-sm">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FOOTER_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-foreground text-sm font-semibold tracking-tight">
              {group.title}
            </p>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-border/60 mt-10 border-t pt-6 text-center text-xs">
        Copyright &copy; {new Date().getFullYear()} SangEok. All rights
        reserved.
      </p>
    </footer>
  );
}
