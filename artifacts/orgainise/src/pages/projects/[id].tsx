import { useState, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { MemoryItem, generateId, AiSuggestion, RevisionSnapshot } from "@/lib/storage";
import { useSyncedStorage as useStorage } from "@/lib/synced-storage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAnalyzeSession, useGenerateContextBlock, useFocusedContextBlock, useReviseMemories } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Edit2, Copy, Download, BrainCircuit, Sparkles,
  Clock, CheckCircle2, XCircle, ArrowRight, RefreshCw, Database,
  Plus, GitMerge, X, Lock, Search, BookOpen,
  Archive, RotateCcw, Wand2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/ui/help-tip";
import { DEMO_PROJECT_ID, DEMO_GENERATED_CONTEXT } from "@/lib/demo-project";
import { markContextGenerated, hasGeneratedContext, isChecklistDismissed, dismissChecklist } from "@/lib/first-success";
import { getCategoryExample, getCategoryHelpTip } from "@/lib/category-examples";
import { GettingStartedCard } from "@/components/getting-started-card";
import { InactivityHint } from "@/components/inactivity-hint";

/* ─── Types ─────────────────────────────────────────────────────── */
type RevisionMatch = {
  memoryId: string;
  currentText: string;
  proposedAction: "keep" | "archive" | "rewrite" | "delete" | "recategorize" | "review";
  proposedText?: string | null;
  proposedCategory?: string | null;
  reason: string;
  confidence: "low" | "medium" | "high";
};

/* ─── InlineEdit ─────────────────────────────────────────────────── */
function InlineEdit({
  value, onSave, className, placeholder,
}: {
  value: string; onSave: (v: string) => void;
  className?: string; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value); setEditing(true);
    setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
  };
  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onSave(t);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) return (
    <input ref={ref} value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") cancel(); }}
      className={cn("bg-transparent border-b-2 border-primary outline-none w-full min-w-[4ch]", className)}
    />
  );

  return (
    <span onClick={startEdit} title="Click to rename"
      className={cn("cursor-text group/ie inline-flex items-center gap-1.5 hover:text-primary transition-colors", className)}>
      {value}
      <Edit2 className="h-3.5 w-3.5 opacity-0 group-hover/ie:opacity-50 transition-opacity shrink-0" />
    </span>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function ProjectDetail() {
  const [match, params] = useRoute("/projects/:id");
  const [, setLocation]  = useLocation();
  const { Storage }      = useStorage();
  const { toast }        = useToast();

  const projectId = params?.id || "";
  const project   = Storage.getProject(projectId);
  const memories  = Storage.getMemories(projectId);
  const history   = Storage.getHistory(projectId);

  /* ── general ui ── */
  const [activeTab, setActiveTab] = useState("memory");

  /* ── memory dialog ── */
  const [isAddMemoryOpen, setIsAddMemoryOpen] = useState(false);
  const [memoryForm, setMemoryForm] = useState({
    text: "", category: "", importanceLevel: "useful-context" as MemoryItem["importanceLevel"],
  });
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null);

  /* ── category management ── */
  const [addingCategory, setAddingCategory]   = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const newCatRef = useRef<HTMLInputElement>(null);

  // delete dialog
  const [deletingCat, setDeletingCat]       = useState<string | null>(null);
  const [deleteMode, setDeleteMode]         = useState<"move" | "archive">("move");
  const [deleteMoveTarget, setDeleteMoveTarget] = useState<string>("");

  // merge dialog
  const [mergingCat, setMergingCat]   = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>("");

  /* ── session ── */
  const [sessionNotes, setSessionNotes]             = useState("");
  const [reviewingSuggestions, setReviewingSuggestions] = useState<AiSuggestion[] | null>(null);
  const [suggestionDecisions, setSuggestionDecisions]   = useState<Record<number, "approve" | "reject">>({});

  /* ── context block ── */
  const [contextLength, setContextLength]           = useState<"short" | "medium" | "full">("medium");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(project?.categories || []);
  const [includeArchive, setIncludeArchive]         = useState(false);
  const [generatedContext, setGeneratedContext]     = useState(
    () => project?.id === DEMO_PROJECT_ID ? DEMO_GENERATED_CONTEXT : ""
  );

  /* ── focused search ── */
  const [focusedQuery, setFocusedQuery]     = useState("");
  const [focusedResult, setFocusedResult]   = useState<{ content: string; matchedCount: number } | null>(null);
  const [lastFocusedQuery, setLastFocusedQuery] = useState("");

  /* ── memory bank view ── */
  const [showArchived, setShowArchived]         = useState(false);
  const [lastRevisionLabel, setLastRevisionLabel] = useState<string | null>(null);

  /* ── revise memories ── */
  const [reviseOpen, setReviseOpen]                 = useState(false);
  const [reviseStep, setReviseStep]                 = useState<1 | 2>(1);
  const [revisionStatement, setRevisionStatement]   = useState("");
  const [revisionSuggestions, setRevisionSuggestions] = useState<RevisionMatch[] | null>(null);
  const [revisionSummary, setRevisionSummary]       = useState("");
  const [revisionDecisions, setRevisionDecisions]   = useState<Record<string, "approve" | "reject">>({});
  const [editedRevisions, setEditedRevisions]       = useState<Record<string, string>>({});

  /* ── demo / first-success ── */
  const isDemo = project?.id === DEMO_PROJECT_ID;
  const [contextEverGenerated, setContextEverGenerated] = useState(
    () => project?.id === DEMO_PROJECT_ID ? true : hasGeneratedContext(project?.id ?? "")
  );
  const [showFirstContextCelebration, setShowFirstContextCelebration] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => isChecklistDismissed(project?.id ?? "")
  );

  /* ── mutations ── */
  const analyzeSession = useAnalyzeSession({
    mutation: {
      onSuccess: r => { setReviewingSuggestions(r.suggestions as AiSuggestion[]); setSuggestionDecisions({}); },
      onError: () => toast({ title: "AI Review Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });
  const generateContext = useGenerateContextBlock({
    mutation: {
      onSuccess: r => {
        setGeneratedContext(r.content);
        if (!contextEverGenerated && !isDemo) {
          markContextGenerated(projectId);
          setContextEverGenerated(true);
          setShowFirstContextCelebration(true);
        }
      },
      onError: () => toast({ title: "Generation Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });

  const focusedContext = useFocusedContextBlock({
    mutation: {
      onSuccess: r => {
        setFocusedResult({ content: r.content, matchedCount: r.matchedCount });
        setLastFocusedQuery(focusedQuery);
      },
      onError: () => toast({ title: "Search Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });

  const reviseMemories = useReviseMemories({
    mutation: {
      onSuccess: r => {
        setRevisionSuggestions(r.matches as RevisionMatch[]);
        setRevisionSummary(r.summary);
        setRevisionDecisions({});
        setEditedRevisions({});
        setReviseStep(2);
      },
      onError: () => toast({ title: "Analysis Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });

  /* ── grouping — MUST live before the early-return to satisfy Rules of Hooks ── */
  const memoriesByCategory = useMemo(() => {
    if (!project) return {} as Record<string, MemoryItem[]>;
    const grouped: Record<string, MemoryItem[]> = {};
    project.categories.forEach(c => { grouped[c] = []; });
    grouped["Uncategorized"] = [];
    memories.forEach(m => {
      (grouped[m.category] ? grouped[m.category] : grouped["Uncategorized"]).push(m);
    });
    return grouped;
  }, [memories, project?.categories]);

  const archivedCount = useMemo(
    () => memories.filter(m => m.importanceLevel === "archive-reference").length,
    [memories],
  );

  if (!project) {
    console.log(`[OrgAInise] ProjectDetail: id="${projectId}" — NOT FOUND in localStorage`);
    return (
      <Layout><div className="text-center py-20 text-muted-foreground">Project not found.</div></Layout>
    );
  }

  console.log(`[OrgAInise] ProjectDetail: id="${projectId}" found — "${project.name}" (${project.categories.length} categories)`);

  /* ── save helpers ── */
  const saveField = (updates: Partial<typeof project>) =>
    Storage.saveProject({ ...project, ...updates, updatedAt: new Date().toISOString() });

  const renameCategory = (oldName: string, newName: string) => {
    const t = newName.trim();
    if (!t || t === oldName) return;
    if (project.categories.includes(t)) {
      toast({ title: "Category already exists", variant: "destructive" }); return;
    }
    saveField({ categories: project.categories.map(c => c === oldName ? t : c) });
    memories.filter(m => m.category === oldName)
      .forEach(m => Storage.saveMemory({ ...m, category: t, updatedAt: new Date().toISOString() }));
    setSelectedCategories(prev => prev.map(c => c === oldName ? t : c));
  };

  /* ── category management handlers ── */
  const commitAddCategory = () => {
    const t = newCategoryName.trim();
    if (!t) { setAddingCategory(false); return; }
    if (project.categories.includes(t)) {
      toast({ title: `"${t}" already exists`, variant: "destructive" });
      return;
    }
    saveField({ categories: [...project.categories, t] });
    setSelectedCategories(prev => [...prev, t]);
    setNewCategoryName("");
    setAddingCategory(false);
    toast({ title: "Category added", description: t });
  };

  const openDeleteCat = (name: string) => {
    const items = (memoriesByCategory[name] || []);
    if (items.length === 0) {
      // empty → delete immediately
      saveField({ categories: project.categories.filter(c => c !== name) });
      setSelectedCategories(prev => prev.filter(c => c !== name));
      toast({ title: "Category deleted" });
      return;
    }
    const others = project.categories.filter(c => c !== name);
    setDeleteMoveTarget(others[0] || "");
    setDeleteMode("move");
    setDeletingCat(name);
  };

  const confirmDeleteCat = () => {
    if (!deletingCat) return;
    const items = memoriesByCategory[deletingCat] || [];

    if (deleteMode === "move" && deleteMoveTarget) {
      items.forEach(m =>
        Storage.saveMemory({ ...m, category: deleteMoveTarget, updatedAt: new Date().toISOString() })
      );
      toast({ title: "Items moved", description: `${items.length} items → "${deleteMoveTarget}"` });
    } else if (deleteMode === "archive") {
      const archiveTarget = project.categories.filter(c => c !== deletingCat)[0] || deletingCat;
      items.forEach(m =>
        Storage.saveMemory({ ...m, category: archiveTarget, importanceLevel: "archive-reference", updatedAt: new Date().toISOString() })
      );
      toast({ title: "Items archived", description: `${items.length} items marked as archive reference` });
    }

    saveField({ categories: project.categories.filter(c => c !== deletingCat) });
    setSelectedCategories(prev => prev.filter(c => c !== deletingCat));
    setDeletingCat(null);
  };

  const openMergeCat = (name: string) => {
    const others = project.categories.filter(c => c !== name);
    if (others.length === 0) {
      toast({ title: "No other categories to merge into", variant: "destructive" }); return;
    }
    setMergeTarget(others[0]);
    setMergingCat(name);
  };

  const confirmMergeCat = () => {
    if (!mergingCat || !mergeTarget) return;
    const items = memoriesByCategory[mergingCat] || [];
    items.forEach(m =>
      Storage.saveMemory({ ...m, category: mergeTarget, updatedAt: new Date().toISOString() })
    );
    saveField({ categories: project.categories.filter(c => c !== mergingCat) });
    setSelectedCategories(prev => prev.filter(c => c !== mergingCat));
    toast({ title: "Categories merged", description: `${items.length} items → "${mergeTarget}"` });
    setMergingCat(null);
  };

  /* ── memory handlers ── */
  const handleSaveMemory = () => {
    if (!memoryForm.text || !memoryForm.category) return;
    Storage.saveMemory({
      id: editingMemory ? editingMemory.id : generateId(),
      projectId: project.id,
      text: memoryForm.text, category: memoryForm.category,
      importanceLevel: memoryForm.importanceLevel,
      createdAt: editingMemory ? editingMemory.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    Storage.saveProject({ ...project, updatedAt: new Date().toISOString() });
    setIsAddMemoryOpen(false);
    setEditingMemory(null);
    setMemoryForm({ text: "", category: project.categories[0] || "", importanceLevel: "useful-context" });
  };

  const handleReviewSession = () => {
    if (!sessionNotes.trim()) return;
    analyzeSession.mutate({
      data: {
        projectName: project.name, projectType: project.type,
        categories: project.categories,
        existingMemory: memories.map(m => ({ text: m.text, category: m.category, importanceLevel: m.importanceLevel })),
        sessionNotes,
      },
    });
  };

  const finalizeReview = () => {
    if (!reviewingSuggestions) return;
    let approvedCount = 0;
    reviewingSuggestions.forEach((sug, idx) => {
      if (suggestionDecisions[idx] === "approve") {
        approvedCount++;
        Storage.saveMemory({
          id: generateId(), projectId: project.id,
          text: sug.suggestedText, category: sug.category,
          importanceLevel: sug.importanceLevel,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
    });
    Storage.saveHistory({
      id: generateId(), projectId: project.id,
      rawNotes: sessionNotes, suggestions: reviewingSuggestions,
      approvedCount, createdAt: new Date().toISOString(),
    });
    Storage.saveProject({ ...project, updatedAt: new Date().toISOString() });
    setReviewingSuggestions(null);
    setSessionNotes("");
    setActiveTab("memory");
    toast({ title: "Session Processed", description: `Added ${approvedCount} new context items.` });
  };

  const handleGenerateContext = () => {
    generateContext.mutate({
      data: {
        projectName: project.name, projectType: project.type,
        length: contextLength, selectedCategories, includeArchive,
        memoryItems: memories
          .filter(m => selectedCategories.includes(m.category))
          .filter(m => includeArchive || m.importanceLevel !== "archive-reference")
          .map(m => ({ text: m.text, category: m.category, importanceLevel: m.importanceLevel })),
      },
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContext);
    toast({ title: "Copied to clipboard" });
  };

  const handleFocusedSearch = () => {
    if (!focusedQuery.trim() || !project) return;
    setFocusedResult(null);
    focusedContext.mutate({
      data: {
        projectName: project.name, projectType: project.type,
        query: focusedQuery.trim(),
        memoryItems: memories.map(m => ({
          text: m.text, category: m.category,
          importanceLevel: m.importanceLevel, createdAt: m.createdAt,
        })),
      },
    });
  };

  const copyFocusedContext = () => {
    if (!focusedResult) return;
    navigator.clipboard.writeText(focusedResult.content);
    toast({ title: "Copied to clipboard" });
  };

  const saveFocusedContextToProject = () => {
    if (!focusedResult || !project) return;
    const category = "Saved Context";
    const updatedCategories = project.categories.includes(category)
      ? project.categories
      : [...project.categories, category];
    if (!project.categories.includes(category)) {
      saveField({ categories: updatedCategories });
    }
    Storage.saveMemory({
      id: generateId(), projectId: project.id,
      text: `[Focused Context: "${lastFocusedQuery}"]\n\n${focusedResult.content}`,
      category, importanceLevel: "must-include",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    toast({ title: "Saved to Project", description: `Added focused context for "${lastFocusedQuery}" to your Memory Bank.` });
  };

  /* ─── Memory Bank handlers ────────────────────────────────────── */
  const archiveMemory = (item: MemoryItem) => {
    Storage.saveMemory({ ...item, importanceLevel: "archive-reference", updatedAt: new Date().toISOString() });
    toast({ title: "Archived", description: "Item archived — toggle 'Show archived' to view it." });
  };

  const restoreMemory = (item: MemoryItem) => {
    Storage.saveMemory({ ...item, importanceLevel: "useful-context", updatedAt: new Date().toISOString() });
    toast({ title: "Restored", description: "Item restored to useful context." });
  };

  const handleUndoRevision = () => {
    const snapshots = Storage.getSnapshots(project.id);
    const latest = snapshots[0];
    if (!latest) return;
    Storage.restoreSnapshot(latest.id, project.id);
    setLastRevisionLabel(null);
    toast({ title: "Revision Undone", description: "Memories restored to pre-revision state." });
  };

  const handleApplyRevision = () => {
    if (!revisionSuggestions) return;
    const snapshot: RevisionSnapshot = {
      id: generateId(),
      projectId: project.id,
      label: `Before: "${revisionStatement.slice(0, 60)}"`,
      createdAt: new Date().toISOString(),
      memoriesSnapshot: [...memories],
    };
    Storage.saveSnapshot(snapshot);

    const approved = revisionSuggestions.filter(m => revisionDecisions[m.memoryId] === "approve");
    let appliedCount = 0;
    const now = new Date().toISOString();

    for (const match of approved) {
      const item = memories.find(m => m.id === match.memoryId);
      if (!item) continue;
      if (match.proposedAction === "archive") {
        Storage.saveMemory({ ...item, importanceLevel: "archive-reference", updatedAt: now });
        appliedCount++;
      } else if (match.proposedAction === "rewrite") {
        const newText = (editedRevisions[match.memoryId] ?? match.proposedText ?? item.text).trim();
        if (newText) { Storage.saveMemory({ ...item, text: newText, updatedAt: now }); appliedCount++; }
      } else if (match.proposedAction === "recategorize" && match.proposedCategory) {
        const cat = project.categories.includes(match.proposedCategory) ? match.proposedCategory : item.category;
        Storage.saveMemory({ ...item, category: cat, updatedAt: now });
        appliedCount++;
      } else if (match.proposedAction === "review") {
        Storage.saveMemory({ ...item, importanceLevel: "archive-reference", updatedAt: now });
        appliedCount++;
      } else if (match.proposedAction === "delete") {
        Storage.deleteMemory(item.id);
        appliedCount++;
      }
    }

    saveField({ updatedAt: now });
    setLastRevisionLabel(revisionStatement.slice(0, 60));
    setRevisionStatement("");
    setRevisionSuggestions(null);
    setRevisionDecisions({});
    setEditedRevisions({});
    setReviseStep(1);
    setReviseOpen(false);
    toast({ title: "Revision Applied", description: `${appliedCount} memor${appliedCount === 1 ? "y" : "ies"} updated. Snapshot saved — undo available.` });
  };

  const downloadTxt = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([generatedContext], { type: "text/plain" }));
    a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-context.txt`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="flex flex-col space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">
                {isDemo ? (
                  project.name
                ) : (
                  <InlineEdit value={project.name} onSave={v => saveField({ name: v })}
                    className="text-3xl font-bold tracking-tight" />
                )}
              </h1>
              {isDemo ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 border border-primary/30 rounded-md bg-primary/5 text-primary">
                  <Lock className="h-3 w-3" /> Demo · Read Only
                </span>
              ) : (
                <InlineEdit value={project.type} onSave={v => saveField({ type: v })}
                  className="font-mono text-xs px-2 py-0.5 border border-border rounded-md bg-background text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center text-sm text-muted-foreground gap-1">
              <Clock className="h-3 w-3" />
              Last updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
              <span className="mx-1">•</span>
              <Database className="h-3 w-3" />
              {memories.length} items
            </div>
          </div>
          <div className="flex gap-2">
            {!isDemo && (
              <Button variant="outline" size="sm" onClick={() => {
                if (confirm("Delete this project?")) { Storage.deleteProject(project.id); setLocation("/"); }
              }}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
          </div>
        </div>

        {!isDemo && !checklistDismissed && (
          <GettingStartedCard
            hasMemories={memories.length > 0}
            hasHistory={history.length > 0}
            hasGeneratedContext={contextEverGenerated}
            onDismiss={() => {
              dismissChecklist(projectId);
              setChecklistDismissed(true);
            }}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:w-[750px] mb-8 h-12">
            <TabsTrigger value="memory"  className="text-xs sm:text-sm">Memory</TabsTrigger>
            <TabsTrigger value="update"  className="text-xs sm:text-sm">Log Session</TabsTrigger>
            <TabsTrigger value="context" className="text-xs sm:text-sm">Get Context</TabsTrigger>
            <TabsTrigger value="search"  className="text-xs sm:text-sm">Search</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
          </TabsList>

          {/* ── MEMORY TAB ─────────────────────────────────────── */}
          <TabsContent value="memory" className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Knowledge Graph</h2>
                <HelpTip text="Save the facts, decisions, updates, and discoveries that matter. OrgAInise uses these to build better context for your AI conversations." />
              </div>
              <div className="flex items-center gap-2">
              {!isDemo && memories.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  setReviseStep(1); setRevisionStatement(""); setRevisionSuggestions(null);
                  setRevisionDecisions({}); setEditedRevisions({}); setReviseOpen(true);
                }}>
                  <Wand2 className="h-3.5 w-3.5" /> Revise Memories
                </Button>
              )}
              <Dialog open={isAddMemoryOpen} onOpenChange={setIsAddMemoryOpen}>
                {!isDemo && (
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setEditingMemory(null);
                      setMemoryForm({ text: "", category: project.categories[0] || "", importanceLevel: "useful-context" });
                    }}>
                      <Sparkles className="mr-2 h-4 w-4" /> Add Note
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingMemory ? "Edit Memory" : "Add Manual Memory"}</DialogTitle>
                    <DialogDescription>Directly insert facts into the project's knowledge base.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Fact / Note</Label>
                      <Textarea value={memoryForm.text}
                        onChange={e => setMemoryForm({ ...memoryForm, text: e.target.value })}
                        className="min-h-[100px]"
                        placeholder="e.g. We decided to drop the React Native build in favour of PWA." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Label>Category</Label>
                          <HelpTip text="Categories tell the AI what kind of information this is. Good categories help the AI preserve the right meaning." side="right" />
                        </div>
                        <Select value={memoryForm.category} onValueChange={v => setMemoryForm({ ...memoryForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {project.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Label>Importance</Label>
                          <HelpTip text="Use higher importance for information the AI should almost always remember. Archive items are kept for history but excluded from context by default." side="right" />
                        </div>
                        <Select value={memoryForm.importanceLevel} onValueChange={(v: any) => setMemoryForm({ ...memoryForm, importanceLevel: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="must-include">Must Include</SelectItem>
                            <SelectItem value="useful-context">Useful Context</SelectItem>
                            <SelectItem value="archive-reference">Archive Reference</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveMemory}>Save Memory</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            <AnimatePresence>
              {lastRevisionLabel && (
                <motion.div key="undo-banner"
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/60 border border-border text-sm"
                >
                  <span className="text-muted-foreground truncate min-w-0 mr-3">
                    Revision applied: <span className="text-foreground font-medium">"{lastRevisionLabel}"</span>
                  </span>
                  <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={handleUndoRevision}>
                    <RotateCcw className="h-3.5 w-3.5" /> Undo
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                {showArchived ? "▾ Hide archived" : `▸ Show archived (${archivedCount})`}
              </button>
            )}

            {/* Category list */}
            {Object.entries(memoriesByCategory).map(([category, items]) => {
              const displayItems = showArchived ? items : items.filter(m => m.importanceLevel !== "archive-reference");
              if (displayItems.length === 0) return null;
              const isUncategorized = category === "Uncategorized";
              return (
                <div key={category} className="space-y-3">
                  {/* Category header */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2 group/cat">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-primary/80">
                        {isUncategorized
                          ? <span className="text-muted-foreground italic text-base">Uncategorized</span>
                          : isDemo
                            ? <span className="font-semibold text-lg text-primary/80">{category}</span>
                            : <InlineEdit value={category} onSave={n => renameCategory(category, n)}
                                className="font-semibold text-lg text-primary/80" />
                        }
                      </h3>
                      {!isUncategorized && <HelpTip text={getCategoryHelpTip(category)} side="right" />}
                    </div>
                    {!isUncategorized && !isDemo && (
                      <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                        <span className="text-xs text-muted-foreground mr-1">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Merge into another category"
                          onClick={() => openMergeCat(category)}>
                          <GitMerge className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={items.length === 0 ? "Delete category" : "Delete category…"}
                          onClick={() => openDeleteCat(category)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {items.length === 0 && !isDemo && (
                    <div className="rounded-lg border border-dashed border-border/60 p-5 bg-muted/10">
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                        {getCategoryExample(category).whatBelongsHere}
                      </p>
                      <div className="rounded-md border border-border/40 bg-card p-3 mb-4 opacity-60 pointer-events-none select-none">
                        <p className="text-sm italic text-foreground/70 leading-relaxed">
                          {getCategoryExample(category).exampleText}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground capitalize">
                            {getCategoryExample(category).exampleImportance.replace(/-/g, " ")}
                          </span>
                          <span className="text-xs text-muted-foreground">example</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                        setEditingMemory(null);
                        setMemoryForm({ text: "", category, importanceLevel: "useful-context" });
                        setIsAddMemoryOpen(true);
                      }}>
                        <Plus className="h-3.5 w-3.5" /> Add Memory
                      </Button>
                    </div>
                  )}

                  {/* Memory items */}
                  <div className="grid gap-3">
                    {displayItems.map(item => {
                      const isArchived = item.importanceLevel === "archive-reference";
                      return (
                        <Card key={item.id} className={cn("bg-card group transition-colors", isArchived ? "opacity-60 border-dashed" : "hover-elevate")}>
                          <CardContent className="p-4 flex gap-4">
                            <div className="flex-1">
                              <p className={cn("text-sm font-medium leading-relaxed", isArchived && "text-muted-foreground")}>{item.text}</p>
                              <div className="flex items-center gap-2 mt-3">
                                <Badge
                                  variant={item.importanceLevel === "must-include" ? "destructive" : item.importanceLevel === "archive-reference" ? "outline" : "secondary"}
                                  className="text-[10px]"
                                >
                                  {item.importanceLevel.replace("-", " ")}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{format(new Date(item.updatedAt), "MMM d")}</span>
                              </div>
                            </div>
                            {!isDemo && (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                                {isArchived ? (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    title="Restore memory"
                                    onClick={() => restoreMemory(item)}>
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                                      onClick={() => { setEditingMemory(item); setMemoryForm({ text: item.text, category: item.category, importanceLevel: item.importanceLevel }); setIsAddMemoryOpen(true); }}>
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                                      title="Archive memory"
                                      onClick={() => archiveMemory(item)}>
                                      <Archive className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => { if (confirm("Delete this memory?")) Storage.deleteMemory(item.id); }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {memories.length === 0 && project.categories.length === 0 && (
              <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
                No memories yet. Paste a session log or add a manual note.
              </div>
            )}

            {/* Add category row */}
            {!isDemo && <div className="pt-2 border-t border-border/30">
              <AnimatePresence mode="wait">
                {addingCategory ? (
                  <motion.div key="adding"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2">
                    <Input
                      ref={newCatRef}
                      autoFocus
                      placeholder="Category name…"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") commitAddCategory();
                        if (e.key === "Escape") { setAddingCategory(false); setNewCategoryName(""); }
                      }}
                      className="max-w-xs h-9"
                    />
                    <Button size="sm" onClick={commitAddCategory}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Button variant="outline" size="sm" className="gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setAddingCategory(true); setNewCategoryName(""); }}>
                      <Plus className="h-4 w-4" /> Add Category
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>}
          </TabsContent>

          {/* ── UPDATE SESSION TAB ─────────────────────────────── */}
          <TabsContent value="update">
            {isDemo ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-base mb-1">This is a read-only demo project</p>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Create your own project to log sessions and let AI extract the important facts for you.
                  </p>
                </div>
              </div>
            ) : !reviewingSuggestions ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-semibold">Process Session Transcript</h2>
                    <HelpTip text="Paste any notes or chat logs from your latest work session. The AI extracts the important facts for you to approve — nothing is saved without your review." />
                  </div>
                  <p className="text-muted-foreground text-sm">Paste the conversation or notes from your latest AI session. The system will extract facts and updates.</p>
                </div>
                <Textarea placeholder="Paste chat logs, commit notes, or random thoughts here..."
                  className="min-h-[400px] font-mono text-sm leading-relaxed p-4"
                  value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} />
                <Button size="lg" className="w-full h-14 text-lg" onClick={handleReviewSession}
                  disabled={!sessionNotes.trim() || analyzeSession.isPending}>
                  {analyzeSession.isPending
                    ? <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Analyzing Transcript…</>
                    : <><BrainCircuit className="mr-2 h-5 w-5" />Extract Insights</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">Review Extracted Context</h2>
                    <p className="text-sm text-muted-foreground">Approve the facts you want to save to the memory bank.</p>
                  </div>
                  <Button variant="outline" onClick={() => setReviewingSuggestions(null)}>Cancel</Button>
                </div>
                <div className="grid gap-4">
                  {reviewingSuggestions.map((sug, idx) => (
                    <Card key={idx} className={cn("border-2 transition-colors", {
                      "border-primary bg-primary/5":       suggestionDecisions[idx] === "approve",
                      "border-destructive/30 opacity-50":  suggestionDecisions[idx] === "reject",
                      "border-border":                     !suggestionDecisions[idx],
                    })}>
                      <CardContent className="p-5">
                        <div className="flex gap-4">
                          <div className="flex-1 space-y-3">
                            <p className="font-medium text-lg leading-snug">{sug.suggestedText}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge>{sug.category}</Badge>
                              <Badge variant="outline">{sug.importanceLevel}</Badge>
                              <span className="text-xs text-muted-foreground italic">Why: {sug.reason}</span>
                            </div>
                            {sug.conflictNote && (
                              <div className="bg-destructive/10 text-destructive-foreground p-2 rounded text-sm border border-destructive/20">
                                <strong>Conflict:</strong> {sug.conflictNote}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 border-l border-border/50 pl-4">
                            <Button variant={suggestionDecisions[idx] === "approve" ? "default" : "outline"}
                              size="sm" className="w-24"
                              onClick={() => setSuggestionDecisions(prev => ({ ...prev, [idx]: "approve" }))}>
                              <CheckCircle2 className="mr-1 h-4 w-4" /> Keep
                            </Button>
                            <Button variant={suggestionDecisions[idx] === "reject" ? "destructive" : "outline"}
                              size="sm" className="w-24"
                              onClick={() => setSuggestionDecisions(prev => ({ ...prev, [idx]: "reject" }))}>
                              <XCircle className="mr-1 h-4 w-4" /> Discard
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {reviewingSuggestions.length === 0 && (
                    <div className="text-center p-12 text-muted-foreground border rounded">No extractable facts found.</div>
                  )}
                </div>
                <div className="sticky bottom-4 p-4 bg-background/95 backdrop-blur border rounded-lg shadow-xl flex justify-between items-center mt-8">
                  <div className="text-sm font-medium">
                    {Object.values(suggestionDecisions).filter(v => v === "approve").length} selected for injection
                  </div>
                  <Button size="lg" onClick={finalizeReview} disabled={Object.keys(suggestionDecisions).length === 0}>
                    Commit to Memory <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── CONTEXT BLOCK TAB ──────────────────────────────── */}
          <TabsContent value="context" className="space-y-6">
            <div className="grid md:grid-cols-[300px_1fr] gap-8">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Context Generator</h2>
                    <HelpTip text="This creates a clean summary you can paste into ChatGPT or another AI so it understands your project quickly." />
                  </div>
                  <p className="text-sm text-muted-foreground mb-6">Compile your memories into an optimised system prompt.</p>
                </div>
                <div className="space-y-3">
                  <Label>Length Target</Label>
                  <Select value={contextLength} onValueChange={(v: any) => setContextLength(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (~500 words)</SelectItem>
                      <SelectItem value="medium">Medium (~1000 words)</SelectItem>
                      <SelectItem value="full">Full Context</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Include Categories</Label>
                  <ScrollArea className="h-[200px] border rounded-md p-3">
                    {project.categories.map(cat => (
                      <div key={cat} className="flex items-center space-x-2 mb-3 last:mb-0">
                        <Checkbox id={`cat-${cat}`} checked={selectedCategories.includes(cat)}
                          onCheckedChange={checked => {
                            if (checked) setSelectedCategories(p => [...p, cat]);
                            else setSelectedCategories(p => p.filter(c => c !== cat));
                          }} />
                        <label htmlFor={`cat-${cat}`} className="text-sm font-medium cursor-pointer">{cat}</label>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
                <div className="flex items-center space-x-2 pt-2 border-t border-border/50">
                  <Checkbox id="archive" checked={includeArchive} onCheckedChange={v => setIncludeArchive(!!v)} />
                  <label htmlFor="archive" className="text-sm cursor-pointer">Include archive references</label>
                </div>
                <Button className="w-full" onClick={handleGenerateContext}
                  disabled={generateContext.isPending || selectedCategories.length === 0}>
                  {generateContext.isPending
                    ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Generating…</>
                    : <><Sparkles className="mr-2 h-4 w-4" />Generate Context Block</>}
                </Button>
              </div>
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Output</h2>
                <AnimatePresence mode="wait">
                  {showFirstContextCelebration ? (
                    <motion.div
                      key="celebration"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="flex items-center justify-center min-h-[400px]"
                    >
                      <div className="text-center space-y-6 max-w-sm">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                          <Sparkles className="h-8 w-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold">Your Context Block Is Ready</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Copy this and paste it into ChatGPT, Claude, Gemini, or any AI conversation — it instantly gets the AI up to speed on your project.
                          </p>
                        </div>
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={() => {
                            copyToClipboard();
                            setShowFirstContextCelebration(false);
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy Context
                        </Button>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowFirstContextCelebration(false)}
                        >
                          Show the full output instead
                        </button>
                      </div>
                    </motion.div>
                  ) : generatedContext ? (
                    <motion.div
                      key="output"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-4"
                    >
                      <Textarea value={generatedContext} readOnly
                        className="min-h-[400px] font-mono text-sm bg-muted/30 leading-relaxed p-4" />
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={copyToClipboard} className="flex-1">
                          <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
                        </Button>
                        <Button variant="outline" onClick={downloadTxt}>
                          <Download className="mr-2 h-4 w-4" /> Download .txt
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      className="flex items-center justify-center min-h-[400px] border border-dashed rounded-lg text-muted-foreground text-center p-8"
                    >
                      <div>
                        <BrainCircuit className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p>Select categories and click Generate to build your context block.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </TabsContent>

          {/* ── SEARCH TAB ─────────────────────────────────────── */}
          <TabsContent value="search" className="space-y-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Focused Context Search</h2>
              <HelpTip text="Search your project memory by topic, character, or question. The AI finds what's relevant and generates a focused context block you can paste straight into any AI conversation." />
            </div>

            {isDemo ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-2">
                  <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Focused search is disabled on the demo project. Create your own project to try it.</p>
                </CardContent>
              </Card>
            ) : memories.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-3">
                  <BookOpen className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                  <p className="text-sm font-medium text-muted-foreground">No memory items yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">Add notes to your Memory Bank first, then search across them here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Enter a topic, character, relationship, or question. OrgAInise searches all{" "}
                  <span className="font-medium text-foreground">{memories.length}</span> saved items and generates a focused context block for that specific topic.
                </p>

                <div className="flex gap-2">
                  <Input
                    placeholder='e.g. "Kael", "Huldar and Aurora relationship", "open questions about the Shattering"'
                    value={focusedQuery}
                    onChange={e => setFocusedQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleFocusedSearch(); }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleFocusedSearch}
                    disabled={!focusedQuery.trim() || focusedContext.isPending}
                    className="shrink-0"
                  >
                    {focusedContext.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {focusedContext.isPending ? "Searching…" : "Generate"}
                  </Button>
                </div>

                <AnimatePresence mode="wait">
                  {focusedContext.isPending && (
                    <motion.div key="loading"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-3 text-sm text-muted-foreground py-8"
                    >
                      <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                      Scanning memory and generating focused context for &ldquo;{focusedQuery}&rdquo;…
                    </motion.div>
                  )}

                  {!focusedContext.isPending && focusedResult && (
                    <motion.div key="result"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span>
                          <span className="font-medium text-foreground">{focusedResult.matchedCount}</span>{" "}
                          {focusedResult.matchedCount === 1 ? "item" : "items"} matched for{" "}
                          &ldquo;<span className="text-foreground">{lastFocusedQuery}</span>&rdquo;
                        </span>
                      </div>
                      <Textarea
                        value={focusedResult.content}
                        readOnly
                        className="min-h-[480px] font-mono text-sm bg-muted/30 leading-relaxed p-4 resize-y"
                      />
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button variant="outline" onClick={copyFocusedContext} className="flex-1">
                          <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
                        </Button>
                        <Button variant="outline" onClick={saveFocusedContextToProject} className="flex-1">
                          <Database className="mr-2 h-4 w-4" /> Save to Memory Bank
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {!focusedContext.isPending && focusedContext.isError && !focusedResult && (
                    <motion.div key="error"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-3 text-sm text-destructive py-4"
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      Focused context search failed. Check your API key or try again.
                    </motion.div>
                  )}

                  {!focusedContext.isPending && !focusedResult && !focusedContext.isError && (
                    <motion.div key="empty"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="space-y-3 pt-2"
                    >
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Try searching for:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "a character name",
                          "a relationship",
                          "open questions",
                          "a location or faction",
                          "a key event",
                          "a theme or symbol",
                        ].map(ex => (
                          <button
                            key={ex}
                            onClick={() => setFocusedQuery(ex)}
                            className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors"
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* ── HISTORY TAB ────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-6">
            <h2 className="text-xl font-semibold">Session History</h2>
            {history.length === 0 ? (
              <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
                No sessions logged yet.
              </div>
            ) : (
              <div className="space-y-4">
                {history.map(entry => (
                  <Card key={entry.id}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(entry.createdAt), "MMM d, yyyy 'at' HH:mm")}
                        </div>
                        <Badge variant="secondary">{entry.approvedCount} items added</Badge>
                      </div>
                      <details className="group">
                        <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
                          <span className="group-open:hidden">▶ Show raw notes</span>
                          <span className="hidden group-open:inline">▼ Hide raw notes</span>
                        </summary>
                        <pre className="mt-3 text-xs font-mono bg-muted/30 p-3 rounded leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {entry.rawNotes}
                        </pre>
                      </details>
                      <div className="grid gap-2">
                        {entry.suggestions.map((sug, i) => (
                          <div key={i} className="text-sm flex items-start gap-2 text-muted-foreground">
                            <span className={cn("mt-0.5 shrink-0", i < entry.approvedCount ? "text-primary" : "opacity-40")}>
                              {i < entry.approvedCount ? "✓" : "✗"}
                            </span>
                            <span className={i >= entry.approvedCount ? "line-through opacity-40" : ""}>{sug.suggestedText}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── DELETE CATEGORY DIALOG ─────────────────────────────── */}
      <Dialog open={!!deletingCat} onOpenChange={open => !open && setDeletingCat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deletingCat}"</DialogTitle>
            <DialogDescription>
              This category has {deletingCat ? (memoriesByCategory[deletingCat]?.length ?? 0) : 0} item
              {(memoriesByCategory[deletingCat ?? ""]?.length ?? 0) !== 1 ? "s" : ""}. What should happen to them?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup value={deleteMode} onValueChange={(v: any) => setDeleteMode(v)} className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => setDeleteMode("move")}>
                <RadioGroupItem value="move" id="del-move" className="mt-0.5" />
                <div className="flex-1">
                  <label htmlFor="del-move" className="font-medium cursor-pointer text-sm">Move to another category</label>
                  {deleteMode === "move" && (
                    <div className="mt-2">
                      <Select value={deleteMoveTarget} onValueChange={setDeleteMoveTarget}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                        <SelectContent>
                          {project.categories.filter(c => c !== deletingCat).map(c =>
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => setDeleteMode("archive")}>
                <RadioGroupItem value="archive" id="del-archive" className="mt-0.5" />
                <label htmlFor="del-archive" className="font-medium cursor-pointer text-sm">
                  Archive items
                  <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                    Mark as archive reference and move to the next available category.
                  </span>
                </label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCat(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteMode === "move" && !deleteMoveTarget}
              onClick={confirmDeleteCat}>
              Delete Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MERGE CATEGORY DIALOG ──────────────────────────────── */}
      <Dialog open={!!mergingCat} onOpenChange={open => !open && setMergingCat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge "{mergingCat}"</DialogTitle>
            <DialogDescription>
              All {mergingCat ? (memoriesByCategory[mergingCat]?.length ?? 0) : 0} item
              {(memoriesByCategory[mergingCat ?? ""]?.length ?? 0) !== 1 ? "s" : ""} will move to the target category, and "{mergingCat}" will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Merge into</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                {project.categories.filter(c => c !== mergingCat).map(c =>
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergingCat(null)}>Cancel</Button>
            <Button disabled={!mergeTarget} onClick={confirmMergeCat}>
              <GitMerge className="mr-2 h-4 w-4" /> Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REVISE MEMORIES DIALOG ──────────────────────────────── */}
      <Dialog open={reviseOpen} onOpenChange={open => {
        if (!open) { setReviseOpen(false); setReviseStep(1); setRevisionStatement(""); setRevisionSuggestions(null); setRevisionDecisions({}); setEditedRevisions({}); }
      }}>
        <DialogContent
          className="max-w-2xl flex flex-col max-h-[90vh] overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> Revise Memories
            </DialogTitle>
            <DialogDescription>
              Describe what changed in your project. The AI will find affected memories and propose what to archive, rewrite, or keep.
            </DialogDescription>
          </DialogHeader>

          {/* Step 1 — describe the change */}
          {reviseStep === 1 && (
            <div className="space-y-4 py-2">
              <Textarea
                placeholder={`e.g. "Keal is no longer canon — remove all references" or "Rename Kael to Caelen throughout"`}
                value={revisionStatement}
                onChange={e => setRevisionStatement(e.target.value)}
                className="min-h-[120px]"
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && revisionStatement.trim() && !reviseMemories.isPending) {
                    reviseMemories.mutate({ data: { projectName: project.name, projectType: project.type, revisionStatement: revisionStatement.trim(), memoryItems: memories.filter(m => m.importanceLevel !== "archive-reference").map(m => ({ id: m.id, text: m.text, category: m.category, importanceLevel: m.importanceLevel, createdAt: m.createdAt })) } });
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {[`"X is no longer canon"`, `"Rename X to Y throughout"`, `"The [system] changed fundamentally"`, `"This plot arc was cut"`].map(ex => (
                  <button key={ex} onClick={() => setRevisionStatement(ex.replace(/^"|"$/g, ""))}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 hover:text-primary transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {memories.filter(m => m.importanceLevel !== "archive-reference").length} active memor{memories.filter(m => m.importanceLevel !== "archive-reference").length === 1 ? "y" : "ies"} will be analysed. ⌘+Enter to submit.
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setReviseOpen(false)}>Cancel</Button>
                <Button
                  disabled={!revisionStatement.trim() || reviseMemories.isPending}
                  onClick={() => reviseMemories.mutate({ data: { projectName: project.name, projectType: project.type, revisionStatement: revisionStatement.trim(), memoryItems: memories.filter(m => m.importanceLevel !== "archive-reference").map(m => ({ id: m.id, text: m.text, category: m.category, importanceLevel: m.importanceLevel, createdAt: m.createdAt })) } })}
                >
                  {reviseMemories.isPending ? (
                    <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Analysing…</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" /> Find Affected Memories</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2 — review suggestions */}
          {reviseStep === 2 && revisionSuggestions !== null && (
            <div className="flex flex-col gap-4 py-2 min-h-0 flex-1 overflow-hidden">
              <p className="text-sm text-muted-foreground shrink-0">{revisionSummary}</p>

              <div className="flex gap-2 flex-wrap shrink-0">
                <Button variant="outline" size="sm" onClick={() => {
                  const next: Record<string, "approve"> = {};
                  revisionSuggestions.forEach(m => {
                    if (m.proposedAction !== "keep" && m.proposedAction !== "delete" && m.proposedAction !== "review") next[m.memoryId] = "approve";
                  });
                  setRevisionDecisions(next);
                }}>Approve Safe Changes</Button>
                <Button variant="outline" size="sm" onClick={() => setRevisionDecisions({})}>Clear All</Button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ overflowY: "auto" }}>
                <div className="space-y-3 pb-2">
                  {revisionSuggestions.filter(m => m.proposedAction !== "keep").length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No changes proposed — all memories look good as-is.</p>
                  ) : revisionSuggestions.filter(m => m.proposedAction !== "keep").map(match => {
                    const decision = revisionDecisions[match.memoryId];
                    const actionColour: Record<string, string> = {
                      archive:      "text-amber-600 bg-amber-500/10 border-amber-500/25",
                      rewrite:      "text-blue-600 bg-blue-500/10 border-blue-500/25",
                      delete:       "text-destructive bg-destructive/5 border-destructive/25",
                      recategorize: "text-purple-600 bg-purple-500/10 border-purple-500/25",
                      review:       "text-indigo-600 bg-indigo-500/10 border-indigo-500/25",
                    };
                    const confColour: Record<string, string> = { high: "text-green-600", medium: "text-amber-600", low: "text-muted-foreground" };
                    return (
                      <Card key={match.memoryId} className={cn("transition-colors border", decision === "approve" ? "border-primary/40 bg-primary/5" : decision === "reject" ? "opacity-40" : "")}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border", actionColour[match.proposedAction] ?? "")}>
                              {match.proposedAction}
                            </span>
                            <span className={cn("text-xs", confColour[match.confidence] ?? "")}>
                              {match.confidence} confidence
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono bg-muted/40 p-2 rounded leading-relaxed break-words">
                            {match.currentText}
                          </p>
                          {match.proposedAction === "rewrite" && (
                            <Textarea
                              value={editedRevisions[match.memoryId] !== undefined ? editedRevisions[match.memoryId] : (match.proposedText ?? "")}
                              onChange={e => setEditedRevisions(prev => ({ ...prev, [match.memoryId]: e.target.value }))}
                              className="text-xs min-h-[72px]"
                              placeholder="Proposed new text (editable)…"
                            />
                          )}
                          {match.proposedAction === "archive" && (
                            <p className="text-xs text-muted-foreground">→ Archived (kept, excluded from context by default)</p>
                          )}
                          {match.proposedAction === "recategorize" && match.proposedCategory && (
                            <p className="text-xs text-muted-foreground">→ Move to: <span className="font-medium text-foreground">{match.proposedCategory}</span></p>
                          )}
                          {match.proposedAction === "review" && (
                            <p className="text-xs text-indigo-600 font-medium">⚑ Flagged for review — approve to archive (reversible), reject to leave unchanged</p>
                          )}
                          {match.proposedAction === "delete" && (
                            <p className="text-xs text-destructive font-medium">⚠ Permanent deletion — consider Archive instead</p>
                          )}
                          <p className="text-xs text-muted-foreground italic">{match.reason}</p>
                          <div className="flex gap-2 pt-1">
                            <Button variant={decision === "reject" ? "destructive" : "outline"} size="sm"
                              onClick={() => setRevisionDecisions(prev => ({ ...prev, [match.memoryId]: "reject" }))}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                            <Button variant={decision === "approve" ? "default" : "outline"} size="sm"
                              onClick={() => setRevisionDecisions(prev => ({ ...prev, [match.memoryId]: "approve" }))}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {revisionSuggestions.filter(m => m.proposedAction === "keep").length > 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      + {revisionSuggestions.filter(m => m.proposedAction === "keep").length} memor{revisionSuggestions.filter(m => m.proposedAction === "keep").length === 1 ? "y" : "ies"} unchanged.
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="shrink-0">
                <Button variant="ghost" onClick={() => setReviseStep(1)}>← Back</Button>
                <Button
                  disabled={Object.values(revisionDecisions).filter(v => v === "approve").length === 0}
                  onClick={handleApplyRevision}
                >
                  Apply {Object.values(revisionDecisions).filter(v => v === "approve").length} Change{Object.values(revisionDecisions).filter(v => v === "approve").length !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!isDemo && (
        <InactivityHint
          hasMemories={memories.length > 0}
          hasHistory={history.length > 0}
          hasGeneratedContext={contextEverGenerated}
        />
      )}
    </Layout>
  );
}
