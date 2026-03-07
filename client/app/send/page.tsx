"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getSocket, disconnectSocket } from "@/utils/socket";
import { createPeer } from "@/utils/peer";

function page() {
  const [roomId, setRoomId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const peerRef = useRef<any>(null);
  const callerIDRef = useRef<string>("");
  useEffect(() => {
    const id = crypto.randomUUID().substring(0, 6).toUpperCase();
    setRoomId(id);

    const socket = getSocket();
    socket.emit("join room", id);
    socket.on("user joined", (payload: any) => {
      const peer = createPeer(false); // non-initiator

      peer.on("signal", (signal: any) => {
        // This fires once (the ANSWER) after we call peer.signal(offer)
        socket.emit("returning signal", { signal, callerID: payload.callerID });
      });

      peer.on("connect", () => {
        // Peer connected — navigate to share page
        // Do NOT attach data handlers here, ShareClient will do that
        router.push(`/share/${id}`);
      });

      peer.signal(payload.signal); // accept the offer
    });

    return () => {
      socket.off("user joined");
    };
  }, []);

  const handleCopy = () => {
    const shareLink = `${window.location.origin}/share/${roomId}`;
    toast.success("Link copied to clipboard!");
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      <div className="flex flex-col items-center text-center max-w-md">
        {/* Pulsing indicator */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-10 relative"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-20 h-20 rounded-full bg-primary/15"
            />
            <motion.div
              animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
              className="absolute w-20 h-20 rounded-full bg-primary/10"
            />
            <div className="w-4 h-4 rounded-full bg-primary" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-[1.5rem] text-foreground mb-2"
        >
          Waiting for someone to join...
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground mb-10"
        >
          Share the code or link below to start sharing
        </motion.p>

        {/* Connection Code */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card rounded-2xl p-8 shadow-md shadow-black/5 border border-border w-full mb-6"
        >
          <p className="text-muted-foreground text-[0.875rem] mb-3">
            Connection Code
          </p>
          <p className="text-[2.5rem] tracking-[0.3em] text-foreground">
            {roomId}
          </p>
        </motion.div>

        {/* Share Link */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-card rounded-2xl p-5 shadow-md shadow-black/5 border border-border w-full flex items-center gap-3"
        >
          <p className="flex-1 text-[0.875rem] text-muted-foreground truncate text-left">
            {typeof window !== "undefined"
              ? `${window.location.origin}/share/${roomId}`
              : `/share/${roomId}`}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-[0.875rem] cursor-pointer shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Link
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Subtle pulsing dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex gap-2 mt-10"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full bg-primary/50"
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

export default page;
