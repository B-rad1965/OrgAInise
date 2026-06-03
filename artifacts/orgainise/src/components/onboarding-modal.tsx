import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, BookOpen, Briefcase, Leaf, TrendingUp, GraduationCap, Layers, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSyncedStorage } from "@/lib/synced-storage";
import { generateId } from "@/lib/storage";
import { markOnboardingDone, skipOnboarding } from "@/lib/onboarding";

/* ─── Project type definitions ──────────────────────────────────── */

const ONBOARDING_TYPES = [
  {
    id: "writing",
    label: "Writing / Worldbuilding",
    icon: BookOpen,
    categories: ["Characters", "Worldbuilding", "Plot", "Story DNA", "Open Questions", "Session History"],
  },
  {
    id: "business",
    label: "Business / Startup",
    icon: Briefcase,
    categories: ["Vision", "Customer Pain", "Features", "Business DNA", "Revenue Model", "Open Questions"],
  },
  {
    id: "gardening",
    label: "Gardening / DIY",
    icon: Leaf,
    categories: ["Garden Goals", "Layout / Design", "Plants", "Garden DNA", "Progress Notes", "Open Questions"],
  },
  {
    id: "trading",
    label: "Trading / Investing",
    icon: TrendingUp,
    categories: ["Watchlist", "Positions", "Strategy Rules", "Trading DNA", "Lessons Learned", "Market Thesis"],
  },
  {
    id: "research",
    label: "Research / Learning",
    icon: GraduationCap,
    categories: ["Key Concepts", "Sources", "Questions", "Research DNA", "Insights", "Next Steps"],
  },
  {
    id: "other",
    label: "Other",
    icon: Layers,
    categories: ["Notes", "Project DNA", "Decisions", "Open Questions", "Next Steps"],
  },
] as const;

type OnboardingType = (typeof ONBOARDING_TYPES)[number];

/* ─── Props ─────────────────────────────────────────────────────── */

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

/* ─── Modal ─────────────────────────────────────────────────────── */

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [, setLocation] = useLocation();
  const { Storage } = useSyncedStorage();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<OnboardingType | null>(null);
  const [projectName, setProjectName] = useState("");

  function handleSkip() {
    skipOnboarding();
    onClose();
  }

  function handleShowHelp() {
    markOnboardingDone();
    onClose();
    setLocation("/help");
  }

  function handleSelectType(type: OnboardingType) {
    setSelectedType(type);
    setStep(3);
  }

  function handleCreateProject() {
    if (!selectedType || !projectName.trim()) return;
    const now = new Date().toISOString();
    const project = {
      id: generateId(),
      name: projectName.trim(),
      type: selectedType.label,
      categories: [...selectedType.categories],
      createdAt: now,
      updatedAt: now,
    };
    Storage.saveProject(project);
    markOnboardingDone();
    onClose();
    setLocation(`/projects/${project.id}`);
  }

  function handleBack() {
    setStep(2);
    setSelectedType(null);
  }

  function resetAndClose() {
    setStep(1);
    setSelectedType(null);
    setProjectName("");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-8 relative"
          >
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label="Skip"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="h-8 w-8 text-primary" />
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-center mb-1">
              Stop re-explaining your projects to AI.
            </h1>
            <p className="text-primary/80 font-medium text-center text-sm mb-5">
              Build a living project brain.
            </p>
            <p className="text-muted-foreground text-center text-sm leading-relaxed mb-8">
              Writing. Trading. Gardening. Research. Business. Anything that evolves over time.
              <br /><br />
              OrgAInise helps you preserve the important notes, decisions, discoveries, lessons,
              and project DNA that AI needs to understand what you're working on. Instead of
              repeatedly catching AI up from scratch, generate a clean context block anytime
              and instantly restore project continuity.
            </p>

            <div className="space-y-3">
              <Button
                className="w-full h-12 text-base font-semibold"
                onClick={() => setStep(2)}
              >
                Create My First Project <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={handleShowHelp}
              >
                Show me how it works
              </Button>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors underline-offset-2 hover:underline"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full p-8"
          >
            <div className="flex items-center gap-2 mb-2">
              <StepDots current={2} total={3} />
            </div>
            <h2 className="text-xl font-bold mb-1">What are you working on?</h2>
            <p className="text-muted-foreground text-sm mb-6">
              We'll suggest starter categories to help your AI understand the project.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {ONBOARDING_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type)}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:border-primary/60 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-4.5 w-4.5 text-primary h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-border/50">
              <button
                onClick={resetAndClose}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                ← Back to welcome
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && selectedType && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-8"
          >
            <div className="mb-2">
              <StepDots current={3} total={3} />
            </div>
            <h2 className="text-xl font-bold mb-1">Name your project</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Give it a clear name — this is what your AI context will reference.
            </p>

            <Input
              autoFocus
              placeholder="e.g. My Fantasy Novel, Project Atlas, Trading Journal…"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && projectName.trim()) handleCreateProject(); }}
              className="h-12 text-base mb-6"
            />

            <div className="mb-6">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Starter categories for {selectedType.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedType.categories.map(cat => (
                  <span
                    key={cat}
                    className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    {cat}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                You can rename or add more categories after creation.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={handleBack} className="shrink-0">
                ← Back
              </Button>
              <Button
                className="flex-1 h-11 font-semibold"
                disabled={!projectName.trim()}
                onClick={handleCreateProject}
              >
                Create Project <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Step dots indicator ────────────────────────────────────────── */
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === current
              ? "w-6 bg-primary"
              : i + 1 < current
              ? "w-3 bg-primary/50"
              : "w-3 bg-border"
          }`}
        />
      ))}
    </div>
  );
}
