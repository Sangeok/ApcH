"use client";
import Link from "next/link";
export default function CardNewsError({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">
        Card news is temporarily unavailable
      </h1>
      <button className="mt-4 underline" onClick={reset}>
        Try again
      </button>
      <p className="mt-4">
        <Link href="/dashboard/card-news">Back to card news</Link>
      </p>
    </div>
  );
}
