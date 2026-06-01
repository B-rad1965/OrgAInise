import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus, BrainCircuit, LayoutDashboard, Cloud, CloudOff, Loader2, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSaveStatus } from "@/hooks/use-save-status";
import { checkStorageHealth, saveAll } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── Save status chip ───────────────────────────────────────────── */
function SaveChip() {
  const { status, lastSaved, errorMsg } = useSaveStatus();

  if (status === 'idle' && !lastSaved) return null;

  return (
    <span className={cn(
      "hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all",
      status === 'saving' && "text-muted-foreground border-border",
      status === 'saved'  && "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
      status === 'error'  && "text-destructive border-destructive/30 bg-destructive/5",
      status === 'idle'   && "text-muted-foreground/60 border-transparent",
    )}>
      {status === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>}
      {status === 'saved'  && <><Cloud className="h-3 w-3" />Saved{lastSaved ? ` · ${formatDistanceToNow(lastSaved, { addSuffix: false })} ago` : ''}</>}
      {status === 'error'  && <><CloudOff className="h-3 w-3" />{errorMsg ?? 'Save failed'}</>}
      {status === 'idle' && lastSaved && (
        <><Cloud className="h-3 w-3 opacity-40" />
          <span className="opacity-40">Last saved {formatDistanceToNow(lastSaved, { addSuffix: true })}</span>
        </>
      )}
    </span>
  );
}

/* ─── Layout ─────────────────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { status, errorMsg } = useSaveStatus();
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Run health check once on mount
  useEffect(() => {
    const result = checkStorageHealth();
    if (!result.ok) {
      setStorageBlocked(true);
      setStorageError(result.error ?? 'localStorage is unavailable');
    }
  }, []);

  const handleSaveNow = () => {
    const result = saveAll();
    if (result.ok) {
      toast({ title: "Saved", description: "All data written to localStorage successfully." });
    } else {
      toast({
        title: "Save failed",
        description: result.error ?? "Could not write to localStorage.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between mx-auto px-4 md:px-8">
          <Link href="/" className="flex items-center space-x-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <span className="font-bold tracking-tight text-lg">OrgAInise</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Live save status */}
            <SaveChip />

            {/* Save Now button — always available as backup */}
            <Button
              variant="ghost"
              size="sm"
              className="flex text-muted-foreground hover:text-foreground gap-1.5"
              onClick={handleSaveNow}
              title="Manually re-write all data to localStorage"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Save Now</span>
            </Button>

            <Link href="/">
              <Button variant="ghost" size="sm" className="flex">
                <LayoutDashboard className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button size="sm" variant="default">
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">New Project</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Storage health warning banner */}
      {storageBlocked && (
        <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Storage unavailable:</strong> {storageError}{" "}
            Projects will not persist after refresh. Try opening this app in a regular browser tab (not private/incognito mode), or check your browser's cookie and site data settings.
          </div>
        </div>
      )}

      {/* Write-error banner (shown when a save fails mid-session) */}
      {status === 'error' && !storageBlocked && (
        <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center gap-2 text-sm text-destructive">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span>
            <strong>Save failed:</strong> {errorMsg} — your last change may not have been stored.{" "}
            <button className="underline font-medium" onClick={handleSaveNow}>Try saving now</button>
          </span>
        </div>
      )}

      <main className="flex-1 container max-w-screen-xl mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
