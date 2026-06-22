"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

// Pure entry form: collect a code and hand off to /share/[roomId], which owns
// the connection. No socket/peer logic lives here anymore.
export default function ReceivePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string>("");

  function handleJoin() {
    if (roomId.length !== 6) return;
    router.push(`/share/${roomId}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
    >
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        onClick={() => router.push("/")}
        className="absolute top-8 left-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </motion.button>

      <div className="flex flex-col items-center text-center max-w-md w-full">
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[1.5rem] text-foreground mb-2"
        >
          Join a session
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground mb-10"
        >
          Enter the connection code shared with you
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card rounded-2xl p-8 shadow-md shadow-black/5 border border-border w-full"
        >
          <input
            type="text"
            placeholder="Enter code"
            maxLength={6}
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
            className="w-full text-center text-[2rem] tracking-[0.3em] bg-background rounded-xl px-4 py-5 text-foreground placeholder:text-muted-foreground/40 border border-border focus:border-primary/40 outline-none transition-colors"
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={roomId.length !== 6}
            onClick={handleJoin}
            className="w-full mt-6 flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <span>Join Session</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-[0.8125rem] text-muted-foreground mt-6"
        >
          Or paste the share link in your browser
        </motion.p>
      </div>
    </motion.div>
  );
}
