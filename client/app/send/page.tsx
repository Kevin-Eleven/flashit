"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

// Sending and receiving both funnel into /share/[roomId], which owns the
// entire signaling/peer handshake. This page just mints a room code and
// redirects — whoever arrives first there waits for the other.
export default function SendPage() {
  const router = useRouter();

  useEffect(() => {
    const code = crypto.randomUUID().substring(0, 6).toUpperCase();
    router.replace(`/share/${code}`);
  }, [router]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
    >
      <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-muted-foreground">Creating your room…</p>
    </motion.div>
  );
}
