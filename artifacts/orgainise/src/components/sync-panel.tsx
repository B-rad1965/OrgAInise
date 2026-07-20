import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  fetchCloudCounts, forcePullFromCloud, forcePushToCloud,
  getLocalCounts, getLastSyncResult, type SyncResult,
} from "@/lib/synced-storage";
import { APP_VERSION, BUILD_LABEL, BUILD_ID } from "@/lib/build-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload, Download, RefreshCw, Database,
  WifiOff, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type CloudCounts = { ok: boolean; projects: number; memories: number; history: number; error?: string };
type ActionState = "idle" | "loading" | "success" | "error";

const DIRECTION_LABEL: Record<string, string> = {
  pushed:  "Pushed local → cloud",
  pulled:  "Pulled cloud → local",
  skipped: "Skipped (cloud was empty)",
  paused:  "Automatic sync paused",
  failed:  "Failed",
};

export function SyncPanel() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [open, setOpen]               = useState(false);
  const [cloudCounts, setCloudCounts] = useState<CloudCounts | null>(null);
  const [fetching, setFetching]       = useState(false);
  const [pushState, setPushState]     = useState<ActionState>("idle");
  const [pullState, setPullState]     = useState<ActionState>("idle");
  const [lastSync, setLastSync]       = useState<SyncResult>(() => getLastSyncResult());
  const [localCounts, setLocalCounts] = useState(() => getLocalCounts());
  const [actionMsg, setActionMsg]     = useState<string | null>(null);

  const refreshCloudCounts = useCallback(async () => {
    setFetching(true);
    const counts = await fetchCloudCounts();
    setCloudCounts(counts);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    setLocalCounts(getLocalCounts());
    setLastSync(getLastSyncResult());
    void refreshCloudCounts();
  }, [open, isAuthenticated, refreshCloudCounts]);

  const loadedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  if (isLoading || !isAuthenticated) return null;

  const userId      = user?.id ?? "—";
  const userDisplay = user?.email ?? user?.firstName ?? "Unknown";

  const handlePush = async () => {
    setPushState("loading");
    setActionMsg(null);
    const result = await forcePushToCloud(user?.id);
    setLastSync(getLastSyncResult());
    setLocalCounts(getLocalCounts());
    if (result.ok) {
      setPushState("success");
      setActionMsg(`✓ Pushed ${result.counts.projects} project(s), ${result.counts.memories} memory item(s) to cloud.`);
      void refreshCloudCounts();
    } else {
      setPushState("error");
      setActionMsg(`✗ Push failed: ${result.error ?? "Unknown error"}`);
    }
    setTimeout(() => setPushState("idle"), 4000);
  };

  const handlePull = async () => {
    setPullState("loading");
    setActionMsg(null);
    const result = await forcePullFromCloud(user?.id);
    setLastSync(getLastSyncResult());
    setLocalCounts(getLocalCounts());
    if (result.ok) {
      setPullState("success");
      if (result.counts.projects === 0) {
        setActionMsg("Cloud has no data yet — nothing was pulled.");
      } else if ((result.preservedLocal ?? 0) > 0) {
        setActionMsg(
          `✓ Cloud data merged safely. ${result.preservedLocal} newer or local-only record(s) were preserved and still need backup.`,
        );
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setActionMsg(`✓ Merged ${result.counts.projects} cloud project(s) safely — page will refresh in 1 second.`);
        setTimeout(() => window.location.reload(), 1200);
      }
    } else {
      setPullState("error");
      setActionMsg(`✗ Pull failed: ${result.error ?? "Unknown error"}`);
    }
    setTimeout(() => setPullState("idle"), 4000);
  };

  return (
    <div className="border-t border-border/40 pt-6 mt-2">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full group"
        onClick={() => setOpen(v => !v)}
      >
        <Database className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
        <span className="font-medium">Cloud Sync Diagnostics</span>
        <span className="ml-auto text-muted-foreground/50">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Signed-in user */}
            <Card className="bg-card/50 border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Signed-in User</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                <div className="font-mono text-[11px] bg-muted/60 px-2 py-1 rounded break-all text-foreground/80 leading-snug">
                  {userId}
                </div>
                <div className="text-sm text-muted-foreground">{userDisplay}</div>
              </CardContent>
            </Card>

            {/* Local */}
            <Card className="bg-card/50 border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Device</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Projects</span>
                  <span className="font-semibold tabular-nums">{localCounts.projects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory items</span>
                  <span className="font-semibold tabular-nums">{localCounts.memories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessions</span>
                  <span className="font-semibold tabular-nums">{localCounts.history}</span>
                </div>
              </CardContent>
            </Card>

            {/* Cloud */}
            <Card className="bg-card/50 border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  Cloud (PostgreSQL)
                  <button
                    className="ml-auto p-0.5 rounded hover:bg-muted transition-colors"
                    onClick={refreshCloudCounts}
                    title="Refresh cloud counts"
                  >
                    <RefreshCw className={cn("h-3 w-3 text-muted-foreground/60 hover:text-foreground", fetching && "animate-spin")} />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                {cloudCounts === null ? (
                  <div className="text-muted-foreground text-xs animate-pulse">Loading…</div>
                ) : !cloudCounts.ok ? (
                  <div className="flex items-center gap-1.5 text-destructive text-xs">
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    {cloudCounts.error}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Projects</span>
                      <span className={cn("font-semibold tabular-nums", cloudCounts.projects === 0 && "text-muted-foreground/50")}>{cloudCounts.projects}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memory items</span>
                      <span className={cn("font-semibold tabular-nums", cloudCounts.memories === 0 && "text-muted-foreground/50")}>{cloudCounts.memories}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sessions</span>
                      <span className={cn("font-semibold tabular-nums", cloudCounts.history === 0 && "text-muted-foreground/50")}>{cloudCounts.history}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            {/* App Build */}
            <Card className="bg-card/50 border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">App Build</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-semibold tabular-nums">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Build ID</span>
                  <span className="font-mono text-[11px] text-foreground/70">{BUILD_ID}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loaded at</span>
                  <span className="font-semibold tabular-nums">{loadedAt}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Last sync status */}
          {lastSync.direction && (
            <div className={cn(
              "flex items-start gap-2 text-sm rounded-md border px-3 py-2.5",
              lastSync.direction === "failed"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : lastSync.direction === "paused"
                ? "border-amber-400/30 bg-amber-400/5 text-amber-300"
                : "border-emerald-400/20 bg-emerald-400/5 text-emerald-400",
            )}>
              {lastSync.direction === "failed"
                ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                : lastSync.direction === "paused"
                ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <span className="font-medium">{DIRECTION_LABEL[lastSync.direction] ?? lastSync.direction}</span>
                {lastSync.direction !== "failed" && lastSync.direction !== "skipped" && lastSync.direction !== "paused" && (
                  <span className="text-muted-foreground ml-2">
                    {lastSync.projects} project(s) · {lastSync.memories} memory item(s) · {lastSync.history} session(s)
                  </span>
                )}
                {lastSync.error && <span className="ml-2">— {lastSync.error}</span>}
              </div>
              {lastSync.timestamp > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(lastSync.timestamp), { addSuffix: true })}
                </span>
              )}
            </div>
          )}

          {/* Action message */}
          {actionMsg && (
            <div className={cn(
              "text-sm px-3 py-2 rounded-md border",
              actionMsg.startsWith("✓")
                ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-400"
                : actionMsg.startsWith("✗")
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-border text-muted-foreground",
            )}>
              {actionMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={handlePush}
              disabled={pushState === "loading" || pullState === "loading"}
            >
              {pushState === "loading"
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Upload className="h-4 w-4" />}
              {pushState === "loading" ? "Pushing…"
               : pushState === "success" ? "Push complete"
               : pushState === "error"   ? "Push failed"
               : "Push Local → Cloud"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={handlePull}
              disabled={pullState === "loading" || pushState === "loading"}
            >
              {pullState === "loading"
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {pullState === "loading" ? "Pulling…"
               : pullState === "success" ? "Pull complete"
               : pullState === "error"   ? "Pull failed"
               : "Pull Cloud → This Device"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/60">
            Push sends local records only when they are not older than their cloud copies. Pull safely merges both copies,
            keeps the newer version of each record, and preserves local-only data. Conflicts stop before changing this device.
          </p>
        </div>
      )}
    </div>
  );
}
