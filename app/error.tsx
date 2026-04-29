"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-zinc-50 text-zinc-950">
        <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6">
          <div className="w-full rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">Temporary issue</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-zinc-950">Temporary issue, try again</h1>
            <p className="mt-3 text-sm text-zinc-500">
              We hit an unexpected problem while loading this page.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
