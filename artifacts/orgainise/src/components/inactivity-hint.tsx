import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X } from "lucide-react";

const SESSION_KEY = "orgainise_inactivity_hint_shown";
const INACTIVITY_MS = 90_000;
const AUTO_HIDE_MS  = 7_000;

interface InactivityHintProps {
  hasMemories: boolean;
  hasHistory: boolean;
  hasGeneratedContext: boolean;
}

function getHintText(hasMemories: boolean, hasHistory: boolean, hasGeneratedContext: boolean): string {
  if (!hasMemories) {
    return "Try adding your first memory — paste a note or key decision that matters for this project.";
  }
  if (!hasHistory) {
    return "You've got memories saved. Try logging a session to keep them updated as your project evolves.";
  }
  if (!hasGeneratedContext) {
    return "You're almost there — head to Get Context to generate your first context block and paste it into an AI chat.";
  }
  return "Need inspiration? Open the Example Project to see how a fully populated project looks.";
}

export function InactivityHint({ hasMemories, hasHistory, hasGeneratedContext }: InactivityHintProps) {
  const [visible, setVisible] = useState(false);
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timer.current)   clearTimeout(timer.current);
    if (hideRef.current) clearTimeout(hideRef.current);
  };

  const resetTimer = useCallback(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    clearTimers();
    timer.current = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SESSION_KEY, "1");
      hideRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }, INACTIVITY_MS);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const events = ["mousemove", "click", "keydown", "scroll", "touchstart"] as const;
    events.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
      clearTimers();
    };
  }, [resetTimer]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="fixed bottom-6 right-6 z-40 max-w-xs"
        >
          <div className="bg-card border border-border shadow-xl rounded-xl p-4 flex gap-3 items-start">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed flex-1">
              {getHintText(hasMemories, hasHistory, hasGeneratedContext)}
            </p>
            <button
              onClick={() => setVisible(false)}
              className="text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
