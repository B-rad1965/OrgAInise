import { useState, useMemo, useEffect, useRef } from "react";
import { useSyncedStorage as useStorage } from "@/lib/synced-storage";
import { parseBackup, type BackupData } from "@/lib/storage";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, BrainCircuit, Database, Clock, Search,
  ArrowUpDown, AlarmClock, ArrowDownAZ, CalendarClock,
  MoreHorizontal, Copy, Trash2, Download, Upload, Lock,
} from "lucide-react";
import { DEMO_PROJECT_ID } from "@/lib/demo-project";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { SyncPanel } from "@/components/sync-panel";
import { APP_VERSION, BUILD_LABEL, PUBLISHED_DATE } from "@/lib/build-info";

type SortOption = "recently-updated" | "alphabetical" | "recently-created";

const SORT_LABELS: Record<SortOption, { label: string; icon: React.ReactNode }> = {
  "recently-updated": { label: "Recently Updated", icon: <AlarmClock className="h-3.5 w-3.5" /> },
  "alphabetical":     { label: "Alphabetical",     icon: <ArrowDownAZ className="h-3.5 w-3.5" /> },
  "recently-created": { label: "Recently Created", icon: <CalendarClock className="h-3.5 w-3.5" /> },
};

export default function Dashboard() {
  const { Storage } = useStorage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const projects = Storage.getProjects();
  const memories  = Storage.getMemories();

  useEffect(() => {
    console.log(`[OrgAInise] Dashboard loaded. Projects in localStorage: ${projects.length}`);
    if (projects.length > 0) {
      projects.forEach(p => console.log(`  → id="${p.id}" name="${p.name}"`));
    }
  }, [projects.length]);

  const [search, setSearch]               = useState("");
  const [sort, setSort]                   = useState<SortOption>("recently-updated");
  const [deleteTarget, setDeleteTarget]   = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{ fileName: string; data: BackupData } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? projects.filter(p => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q))
      : [...projects];

    if (sort === "recently-updated") {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sort === "alphabetical") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [projects, search, sort]);

  function handleExport() {
    const allProjects = Storage.getProjects().filter(p => p.id !== DEMO_PROJECT_ID);
    const allMemories = Storage.getMemories().filter(m => m.projectId !== DEMO_PROJECT_ID);
    const allHistory  = allProjects.flatMap(p => Storage.getHistory(p.id));
    const projectIds  = new Set(allProjects.map(p => p.id));
    const allSnapshots = Storage.getAllSnapshots().filter(s => projectIds.has(s.projectId));

    const backup: BackupData = {
      exportedAt: new Date().toISOString(),
      version: 2,
      projects: allProjects,
      memories: allMemories,
      history:  allHistory,
      snapshots: allSnapshots,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `orgainise-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Backup downloaded",
      description: `${allProjects.length} project(s) · ${allMemories.length} memory item(s) · ${allHistory.length} session(s) · ${allSnapshots.length} revision snapshot(s) exported.`,
    });
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Backup not imported", description: "Backup files must be 10 MB or smaller.", variant: "destructive" });
      return;
    }

    try {
      const parsedJson: unknown = JSON.parse(await file.text());
      const parsed = parseBackup(parsedJson);
      if (!parsed.ok) {
        toast({ title: "Backup not imported", description: parsed.error, variant: "destructive" });
        return;
      }
      setPendingRestore({ fileName: file.name, data: parsed.data });
    } catch {
      toast({ title: "Backup not imported", description: "The selected file is not valid JSON.", variant: "destructive" });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function handleRestoreConfirm() {
    if (!pendingRestore) return;
    const result = Storage.restoreBackup(pendingRestore.data);
    if (!result.ok) {
      toast({ title: "Restore failed", description: result.error, variant: "destructive" });
      return;
    }

    const count = pendingRestore.data.projects.length;
    setPendingRestore(null);
    toast({
      title: "Backup restored",
      description: `${count} project${count === 1 ? "" : "s"} restored from this backup.`,
    });
  }

  function handleDuplicate(id: string, name: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const copy = Storage.duplicateProject(id);
    if (copy) {
      toast({ title: "Project duplicated", description: `"${copy.name}" is ready to edit.` });
      setLocation(`/projects/${copy.id}`);
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const project = Storage.getProject(deleteTarget);
    Storage.deleteProject(deleteTarget);
    setDeleteTarget(null);
    toast({ title: "Project deleted", description: `"${project?.name}" has been removed.` });
  }

  return (
    <Layout>
      <div className="flex flex-col space-y-8 pb-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Command Centre</h1>
            <p className="text-muted-foreground mt-1">Keep your projects organized and your AI up to speed.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => void handleImportFile(event.target.files?.[0])}
              data-testid="input-import-data"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => importInputRef.current?.click()}
              className="gap-2"
              data-testid="button-import-data"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import Backup</span>
            </Button>
            {projects.some(p => p.id !== DEMO_PROJECT_ID) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="gap-2"
                data-testid="button-export-data"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export All Data</span>
              </Button>
            )}
          </div>
        </div>

        {projects.filter(p => p.id !== DEMO_PROJECT_ID).length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border rounded-lg bg-card/50"
          >
            <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <BrainCircuit className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No projects yet</h2>
            <p className="text-muted-foreground max-w-md mb-8">
              Create your first project to start turning messy session notes into clean, curated memory for your AI context.
            </p>
            <Link href="/projects/new">
              <Button size="lg" className="h-12 px-8 font-medium" data-testid="button-initialize-workspace">
                <Plus className="mr-2 h-5 w-5" />
                Initialize Workspace
              </Button>
            </Link>
          </motion.div>
        ) : (
          <>
            {/* Search + Sort bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  data-testid="input-search-projects"
                  placeholder="Search projects…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0" data-testid="button-sort-projects">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{SORT_LABELS[sort].label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuRadioGroup value={sort} onValueChange={v => setSort(v as SortOption)}>
                    {(Object.entries(SORT_LABELS) as [SortOption, typeof SORT_LABELS[SortOption]][]).map(([value, { label, icon }]) => (
                      <DropdownMenuRadioItem key={value} value={value} className="gap-2" data-testid={`sort-option-${value}`}>
                        {icon}{label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Results */}
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  key="no-results"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <Search className="h-10 w-10 text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">
                    No projects match <span className="text-foreground font-medium">"{search}"</span>
                  </p>
                  <button className="text-sm text-primary mt-2 hover:underline" onClick={() => setSearch("")}>
                    Clear search
                  </button>
                </motion.div>
              ) : (
                <motion.div key="grid" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((project, idx) => {
                    const projectMemories = memories.filter(m => m.projectId === project.id);

                    return (
                      <motion.div
                        key={project.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.04 }}
                        data-testid={`card-project-${project.id}`}
                      >
                        <Link href={`/projects/${project.id}`}>
                          <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer group hover-elevate">
                            <CardHeader className="pb-3">
                              <div className="flex justify-between items-start gap-2">
                                <CardTitle className="text-xl group-hover:text-primary transition-colors line-clamp-1 flex-1">
                                  {project.name}
                                </CardTitle>

                                <div className="flex items-center gap-1 shrink-0">
                                  {project.id === DEMO_PROJECT_ID ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border border-primary/30 rounded bg-primary/5 text-primary hidden sm:flex">
                                      <Lock className="h-2.5 w-2.5" /> Demo
                                    </span>
                                  ) : (
                                    <Badge variant="secondary" className="font-mono text-xs hidden sm:flex">
                                      {project.type}
                                    </Badge>
                                  )}

                                  {/* Card action menu */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        data-testid={`button-card-menu-${project.id}`}
                                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44" onClick={e => e.stopPropagation()}>
                                      {project.id !== DEMO_PROJECT_ID && (
                                        <DropdownMenuItem
                                          data-testid={`button-duplicate-${project.id}`}
                                          className="gap-2 cursor-pointer"
                                          onSelect={e => handleDuplicate(project.id, project.name, e as unknown as React.MouseEvent)}
                                        >
                                          <Copy className="h-4 w-4" />
                                          Duplicate
                                        </DropdownMenuItem>
                                      )}
                                      {project.id !== DEMO_PROJECT_ID && <DropdownMenuSeparator />}
                                      {project.id !== DEMO_PROJECT_ID ? (
                                        <DropdownMenuItem
                                          data-testid={`button-delete-${project.id}`}
                                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                          onSelect={e => { e.preventDefault(); setDeleteTarget(project.id); }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem disabled className="gap-2 text-muted-foreground text-xs">
                                          <Lock className="h-4 w-4" />
                                          Read-only demo
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              <CardDescription className="flex items-center mt-2">
                                <Clock className="mr-1 h-3 w-3" />
                                Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center space-x-4 text-sm">
                                <div className="flex items-center text-muted-foreground">
                                  <Database className="mr-1 h-4 w-4" />
                                  {projectMemories.length} {projectMemories.length === 1 ? "memory" : "memories"}
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                  <BrainCircuit className="mr-1 h-4 w-4" />
                                  {project.categories.length} categories
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        <SyncPanel />

        {/* Version footer */}
        <div className="mt-6 pt-4 border-t border-border/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs text-muted-foreground/50">
          <span>
            Version {APP_VERSION} &nbsp;·&nbsp; Build {BUILD_LABEL} &nbsp;·&nbsp; Published {PUBLISHED_DATE}
          </span>
          <span className="hidden sm:block">
            If features look missing, try a hard refresh — <kbd className="px-1 py-0.5 rounded border border-border/40 font-mono text-[10px]">Ctrl+F5</kbd> on Windows or <kbd className="px-1 py-0.5 rounded border border-border/40 font-mono text-[10px]">⌘⇧R</kbd> on Mac
          </span>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the project, all its memory items, session history, and revision snapshots.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRestore} onOpenChange={open => !open && setPendingRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all projects and memory currently stored on this device with the validated data from
              {" "}<span className="font-medium text-foreground">{pendingRestore?.fileName}</span>. Cloud data will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreConfirm} data-testid="button-restore-confirm">
              Restore Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
