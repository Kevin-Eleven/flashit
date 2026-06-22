"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  // Theme comes from localStorage on the client, so the icon would mismatch the
  // server render — only reveal it after mount.
  const [mounted, setMounted] = useState(false);
  // Standard SSR mount guard: flips once after hydration so the icon matches.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="fixed top-5 right-5 z-50 p-2.5 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm transition-colors cursor-pointer"
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )
      ) : (
        <div className="w-4 h-4" />
      )}
    </motion.button>
  );
}
