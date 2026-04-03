import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="text-muted-foreground mt-16 space-y-2 border-t pt-8 text-center text-sm">
      <div className="flex justify-center gap-4">
        <Link
          href="/terms"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          이용약관
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          개인정보 처리방침
        </Link>
      </div>
      <p>Copyright &copy; {new Date().getFullYear()} SangEok. All rights reserved.</p>
    </footer>
  );
}
