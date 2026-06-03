import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BrainCircuit, FolderPlus, Sparkles, Tag, Zap, RefreshCw, RotateCcw } from "lucide-react";
import { resetOnboarding } from "@/lib/onboarding";

const HOW_IT_WORKS = [
  {
    icon: FolderPlus,
    title: "1. Create a project",
    body: "Each project is its own living memory bank. Give it a name and pick a type — OrgAInise will suggest a set of starter categories to organise what you save.",
  },
  {
    icon: Sparkles,
    title: "2. Add memories",
    body: "Save the facts, decisions, updates, and discoveries that matter. You can add them manually, or paste session notes and let the AI extract the important bits for you to approve.",
  },
  {
    icon: Tag,
    title: "3. Use categories",
    body: "Categories teach the AI what to focus on. \"Story DNA\" tells it about themes. \"Key Decisions\" tells it what you've already resolved. Good categories mean better, more focused context.",
  },
  {
    icon: Zap,
    title: "4. Generate context",
    body: "When you start a new AI conversation, go to the Get Context tab. Choose a length, pick your categories, and generate. Copy the output and paste it at the start of your ChatGPT or Claude conversation to get back on track fast.",
  },
  {
    icon: RefreshCw,
    title: "5. Keep refining",
    body: "As your project changes, log new sessions. OrgAInise will suggest updates to your memory bank. Approve what's useful, reject what isn't — and your context gets smarter over time.",
  },
];

const HELP_TIPS = [
  {
    term: "Project DNA",
    definition:
      "The deeper meaning of a project: themes, emotional engines, core principles, or big truths that help reconstruct the whole project later. Great for creative or long-running work.",
  },
  {
    term: "Importance levels",
    definition:
      "\"Must Include\" items always appear in context blocks. \"Useful Context\" items appear when space allows. \"Archive Reference\" items are kept for history but not included by default.",
  },
  {
    term: "Context block",
    definition:
      "A compact, AI-ready summary of your project that you paste at the start of a conversation. Short ≈ 500 words, Medium ≈ 1 000 words, Full includes everything.",
  },
  {
    term: "Log Session",
    definition:
      "Paste any notes, chat logs, or rough thoughts from a work session. The AI extracts facts and suggests which ones to add to your memory bank — you approve or discard each one.",
  },
];

const USE_CASES = [
  {
    emoji: "📖",
    title: "Writing & Worldbuilding",
    tracks: ["Characters", "Worldbuilding", "Plot Threads", "Story DNA", "Canon", "Session Notes"],
    benefit: "Generate context blocks that help AI continue your story without losing continuity.",
  },
  {
    emoji: "📈",
    title: "Trading & Investing",
    tracks: ["Watchlists", "Positions", "Trading Rules", "Lessons Learned", "Market Thesis", "Research"],
    benefit: "Generate context blocks that instantly restore your trading framework and current thinking.",
  },
  {
    emoji: "🌱",
    title: "Gardening & DIY Projects",
    tracks: ["Design Goals", "Layout Plans", "Plant Choices", "Progress Notes", "Lessons Learned", "Project DNA"],
    benefit: "Generate context blocks that help AI understand the full history and vision of your project.",
  },
];

export default function HelpPage() {
  const [, setLocation] = useLocation();

  function doRestart() {
    resetOnboarding();
    window.dispatchEvent(new CustomEvent("orgainise:restart-tutorial"));
    setLocation("/");
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-16 space-y-12">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 pt-2">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">How OrgAInise Works</h1>
            </div>
            <p className="text-muted-foreground">
              A quick guide to building AI context that actually works.
            </p>
          </div>
        </div>

        {/* What Can I Use OrgAInise For? */}
        <div>
          <h2 className="text-xl font-semibold mb-1">What Can I Use OrgAInise For?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Anything with a history worth remembering — creative projects, research, trading, side businesses, personal development, and more.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {USE_CASES.map(({ emoji, title, tracks, benefit }) => (
              <div
                key={title}
                className="rounded-xl border border-border/60 bg-muted/20 p-5 flex flex-col gap-4"
              >
                <div>
                  <div className="text-2xl mb-2">{emoji}</div>
                  <h3 className="font-semibold text-base leading-tight">{title}</h3>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Keep track of</p>
                  <ul className="space-y-1">
                    {tracks.map(t => (
                      <li key={t} className="flex items-center gap-2 text-sm text-foreground/80">
                        <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
                  {benefit}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works steps */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Step by Step</h2>
          <div className="space-y-4">
            {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="border-border/50 hover-elevate transition-colors">
                <CardContent className="p-5 flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base">{title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Glossary */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Quick Glossary</h2>
          <div className="space-y-3">
            {HELP_TIPS.map(({ term, definition }) => (
              <div key={term} className="p-4 rounded-lg border border-border/50 bg-muted/20">
                <span className="text-sm font-semibold text-primary">{term}</span>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{definition}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Restart tutorial */}
        <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Want to run through the setup again?</p>
            <p className="text-xs text-muted-foreground mt-0.5">The guided setup walks you through creating your first project.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default" className="gap-2 shrink-0">
                <RotateCcw className="h-4 w-4" />
                Restart Tutorial
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restart onboarding tutorial?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear your tutorial progress and show the welcome guide again from the beginning.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doRestart}>Restart</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Layout>
  );
}
