import { motion } from "framer-motion";
import { CheckCircle2, Circle, PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GettingStartedCardProps {
  hasMemories: boolean;
  hasHistory: boolean;
  hasGeneratedContext: boolean;
  onDismiss: () => void;
}

export function GettingStartedCard({
  hasMemories,
  hasHistory,
  hasGeneratedContext,
  onDismiss,
}: GettingStartedCardProps) {
  const allDone = hasMemories && hasHistory && hasGeneratedContext;

  const steps = [
    { label: "Add your first memory", done: hasMemories },
    { label: "Log a work session", done: hasHistory },
    { label: "Generate a context block", done: hasGeneratedContext },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border p-5 mb-2",
        allDone
          ? "bg-primary/10 border-primary/30"
          : "bg-muted/30 border-border/60"
      )}
    >
      {allDone ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <PartyPopper className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm">Project Brain Ready</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You now have enough information to generate useful AI context.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div>
          <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-3">
            Build Your First Project Brain
          </p>
          <div className="space-y-2">
            {steps.map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2.5 text-sm">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                )}
                <span className={cn(done && "text-muted-foreground line-through")}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
