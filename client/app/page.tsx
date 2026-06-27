"use client";

import { motion } from "framer-motion";
import { Send, Download } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-6"
    >
      {/* Subtle background shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#EDE8DC] dark:bg-[#3a2e20] opacity-60 dark:opacity-30 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#E8E2D5] dark:bg-[#2e2418] opacity-50 dark:opacity-25 blur-3xl" />
        <div className="absolute top-[30%] left-[20%] w-[300px] h-[300px] rounded-full bg-[#F0EBE0] dark:bg-[#342a1a] opacity-40 dark:opacity-20 blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="text-[2.75rem] tracking-tight text-foreground mb-3">
            FlashIt
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-muted-foreground text-[1.125rem] mb-16"
        >
          Simple, instant file and text sharing.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-5"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-3 px-10 py-4 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/25 dark:shadow-primary/20 cursor-pointer transition-shadow hover:shadow-xl hover:shadow-primary/35 dark:hover:shadow-primary/30"
            onClick={() => router.push("/send")}
          >
            <Send className="w-5 h-5" />
            <span>Send Files</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-3 px-10 py-4 bg-card text-card-foreground rounded-full shadow-lg shadow-black/5 dark:shadow-black/30 border border-border cursor-pointer transition-shadow hover:shadow-xl"
            onClick={() => router.push("/receive")}
          >
            <Download className="w-5 h-5" />
            <span>Receive Files</span>
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}
