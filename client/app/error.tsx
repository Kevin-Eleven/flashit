"use client";

import { useEffect } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";

// Route-level error boundary (Next.js App Router convention). Catches
// render/runtime errors thrown anywhere under this segment so a crash in,
// say, the WebRTC handshake doesn't take down the whole tab with a blank
// white screen.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client] unhandled render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-red-400" />
      </div>
      <div>
        <p className="text-foreground font-medium text-lg mb-1">
          Something went wrong
        </p>
        <p className="text-muted-foreground text-sm max-w-sm">
          An unexpected error interrupted this page. Your peer connection (if
          any) was not affected on the other side.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => (window.location.href = "/")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Go home
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
