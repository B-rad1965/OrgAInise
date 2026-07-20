import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Plus, BrainCircuit, LayoutDashboard, CloudOff, Loader2, Save, AlertTriangle, LogIn, LogOut, User, CheckCircle2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSaveStatus } from "@/hooks/use-save-status";
import { checkStorageHealth, saveAll } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";
import { getCloudWriteError } from "@/lib/synced-storage";

const SYNC_DONE_KEY = "orgainise_db_synced";

/* ─── Save status chip ───────────────────────────────────────────── */
function SaveChip() {
  const { status, lastSaved } = useSaveStatus();

  if (status === 'idle' && !lastSaved) return null;

  return (
    <span className={cn(
      "hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all",
      status === 'saving' && "text-muted-foreground border-border",
      status === 'saved'  && "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
      status === 'error'  && "text-destructive border-destructive/30 bg-destructive/5",
      status === 'idle'   && "text-muted-foreground/60 border-transparent",
    )}>
      {status === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" />Saving locally…</>}
      {status === 'saved'  && <><Save className="h-3 w-3" />Saved locally{lastSaved ? ` · ${formatDistanceToNow(lastSaved, { addSuffix: false })} ago` : ''}</>}
      {status === 'error'  && <><AlertTriangle className="h-3 w-3" />Local save failed</>}
      {status === 'idle' && lastSaved && (
        <><Save className="h-3 w-3 opacity-40" />
          <span className="opacity-40">Last local save {formatDistanceToNow(lastSaved, { addSuffix: true })}</span>
        </>
      )}
    </span>
  );
}

/* ─── Auth button — completely optional, never blocks access ─────── */
function AuthButton({ dbSynced }: { dbSynced: boolean }) {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    const displayName = user.firstName ?? user.email ?? "User";
    return (
      <div className="flex items-center gap-1">
        <span
          className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1"
          title={dbSynced ? "Your projects are backed up to the cloud" : ""}
        >
          {dbSynced
            ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            : <User className="h-3 w-3" />
          }
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={logout}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5 md:mr-1.5" />
          <span className="hidden md:inline">Sign out</span>
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground"
      onClick={login}
      title="Sign in to back up your data"
    >
      <LogIn className="h-3.5 w-3.5 md:mr-1.5" />
      <span className="hidden md:inline">Sign in</span>
    </Button>
  );
}

/* ─── Layout ─────────────────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const { status, errorMsg } = useSaveStatus();
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [dbSynced, setDbSynced] = useState(() => sessionStorage.getItem(SYNC_DONE_KEY) === "1");
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(() => getCloudWriteError());
  const lastCloudErrorToastAt = useRef(0);

  // Run storage health check once on mount
  useEffect(() => {
    const result = checkStorageHealth();
    if (!result.ok) {
      setStorageBlocked(true);
      setStorageError(result.error ?? 'localStorage is unavailable');
    }
  }, []);

  // Listen for successful DB sync and show confirmation toast
  useEffect(() => {
    const handler = (e: Event) => {
      const { projects, memories, history } = (e as CustomEvent<{
        projects: number;
        memories: number;
        history: number;
      }>).detail;

      setDbSynced(true);
      setCloudSyncError(null);

      const parts: string[] = [];
      if (projects > 0) parts.push(`${projects} project${projects !== 1 ? "s" : ""}`);
      if (memories > 0) parts.push(`${memories} memory item${memories !== 1 ? "s" : ""}`);
      if (history > 0)  parts.push(`${history} session${history !== 1 ? "s" : ""}`);

      toast({
        title: "Data backed up to your account",
        description: parts.length > 0
          ? `${parts.join(", ")} ${parts.length > 1 ? "are" : "is"} now saved to the cloud.`
          : "Your workspace is now backed up.",
      });
    };

    window.addEventListener("orgainise:synced", handler);
    window.addEventListener("orgainise:pulled", handler);
    return () => {
      window.removeEventListener("orgainise:synced", handler);
      window.removeEventListener("orgainise:pulled", handler);
    };
  }, [toast]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { error } = (e as CustomEvent<{ error: string }>).detail;
      setDbSynced(false);
      setCloudSyncError(error);

      const now = Date.now();
      if (now - lastCloudErrorToastAt.current >= 10_000) {
        lastCloudErrorToastAt.current = now;
        toast({
          title: "Saved locally, but cloud backup failed",
          description: error,
          variant: "destructive",
        });
      }
    };

    window.addEventListener("orgainise:sync-error", handler);
    return () => window.removeEventListener("orgainise:sync-error", handler);
  }, [toast]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { reason } = (e as CustomEvent<{ reason: string }>).detail;
      setDbSynced(false);
      toast({
        title: "Cloud sync paused for safety",
        description: reason,
      });
    };

    window.addEventListener("orgainise:sync-paused", handler);
    return () => window.removeEventListener("orgainise:sync-paused", handler);
  }, [toast]);

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

            <Link href="/help">
              <Button variant="outline" size="sm" className="flex gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/70">
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </Button>
            </Link>

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

            {/* Auth — optional, never blocks access */}
            <AuthButton dbSynced={dbSynced} />
          </div>
        </div>
      </header>

      {cloudSyncError && isAuthenticated && (
        <div className="w-full bg-amber-400/10 border-b border-amber-400/20 px-4 py-2.5 flex items-start gap-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Cloud backup incomplete:</strong> {cloudSyncError}{" "}
            <Link href="/" className="underline underline-offset-2 hover:text-amber-100">
              Review sync diagnostics
            </Link>
          </div>
        </div>
      )}

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
