"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { navigate } from "next/dist/client/components/segment-cache/navigation";
import { getSocket, disconnectSocket } from "@/utils/socket";
import { createPeer, getPeer } from "@/utils/peer";
import toast from "react-hot-toast";

function page() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string>("");
  // When user clicks "Join Session":
  const [joining, setJoining] = useState(false); // prevent multiple clicks
  function handleJoin() {
    if (joining) return;
    setJoining(true);

    const socket = getSocket();
    socket.emit("join room", roomId);

    socket.on("all users", (users: string[]) => {
      if (users.length === 0) {
        // No one in the room — invalid code or room not created yet
        toast.error("No one is in this room yet");
        setJoining(false);
        return;
      }

      // Someone is waiting — we're the initiator
      const peer = createPeer(true);

      peer.on("signal", (signal: any) => {
        // This fires once (the OFFER) since trickle:false
        socket.emit("sending signal", {
          userToSignal: users[0], // ← was "usersToSignal" (typo) in your code
          callerID: socket.id,
          signal,
        });
      });

      peer.on("connect", () => {
        router.push(`/share/${roomId}`);
      });
    });

    socket.on("receiving returned signal", (payload: any) => {
      // Sender's answer arrives — feed it to our peer to complete handshake
      getPeer()?.signal(payload.signal);
    });

    socket.on("room full", () => {
      toast.error("Room is full or invalid");
      setJoining(false);
    });
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

export default page;
