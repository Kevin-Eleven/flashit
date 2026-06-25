"use client";

import { useEffect } from "react";

// Root-level fallback (Next.js App Router convention) for errors thrown by
// the root layout itself, where app/error.tsx can't apply because it
// renders inside that same layout. Must render its own <html>/<body> and
// can't assume globals.css or any provider mounted successfully.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client] unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.125rem", fontWeight: 500 }}>
          Something went wrong
        </p>
        <p style={{ color: "#888", maxWidth: "24rem" }}>
          FlashIt failed to load. Please reload the page.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "9999px",
            background: "#111",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
