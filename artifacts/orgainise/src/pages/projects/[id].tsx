import { useState, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useStorage, MemoryItem, generateId, AiSuggestion } from "@/lib/storage";
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
import { useAnalyzeSession, useGenerateContextBlock } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Edit2, Copy, Download, BrainCircuit, Sparkles,
  Clock, CheckCircle2, XCircle, ArrowRight, RefreshCw, Database,
  Plus, GitMerge, X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  const [generatedContext, setGeneratedContext]     = useState("");

  /* ── mutations ── */
  const analyzeSession = useAnalyzeSession({
    mutation: {
      onSuccess: r => { setReviewingSuggestions(r.suggestions); setSuggestionDecisions({}); },
      onError: () => toast({ title: "AI Review Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });
  const generateContext = useGenerateContextBlock({
    mutation: {
      onSuccess: r => setGeneratedContext(r.content),
      onError: () => toast({ title: "Generation Failed", description: "Check your OpenAI API key or try again.", variant: "destructive" }),
    },
  });

  if (!project) return (
    <Layout><div className="text-center py-20 text-muted-foreground">Project not found.</div></Layout>
  );

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

  /* ── grouping ── */
  const memoriesByCategory = useMemo(() => {
    const grouped: Record<string, MemoryItem[]> = {};
    project.categories.forEach(c => { grouped[c] = []; });
    grouped["Uncategorized"] = [];
    memories.forEach(m => {
      (grouped[m.category] ? grouped[m.category] : grouped["Uncategorized"]).push(m);
    });
    return grouped;
  }, [memories, project.categories]);

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
                <InlineEdit value={project.name} onSave={v => saveField({ name: v })}
                  className="text-3xl font-bold tracking-tight" />
              </h1>
              <InlineEdit value={project.type} onSave={v => saveField({ type: v })}
                className="font-mono text-xs px-2 py-0.5 border border-border rounded-md bg-background text-muted-foreground" />
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
            <Button variant="outline" size="sm" onClick={() => {
              if (confirm("Delete this project?")) { Storage.deleteProject(project.id); setLocation("/"); }
            }}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px] mb-8 h-12">
            <TabsTrigger value="memory"  className="text-sm">Memory Bank</TabsTrigger>
            <TabsTrigger value="update"  className="text-sm">Log Session</TabsTrigger>
            <TabsTrigger value="context" className="text-sm">Get Context</TabsTrigger>
            <TabsTrigger value="history" className="text-sm">History</TabsTrigger>
          </TabsList>

          {/* ── MEMORY TAB ─────────────────────────────────────── */}
          <TabsContent value="memory" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Knowledge Graph</h2>
              <Dialog open={isAddMemoryOpen} onOpenChange={setIsAddMemoryOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingMemory(null);
                    setMemoryForm({ text: "", category: project.categories[0] || "", importanceLevel: "useful-context" });
                  }}>
                    <Sparkles className="mr-2 h-4 w-4" /> Add Note
                  </Button>
                </DialogTrigger>
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
                        <Label>Category</Label>
                        <Select value={memoryForm.category} onValueChange={v => setMemoryForm({ ...memoryForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {project.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Importance</Label>
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

            {/* Category list */}
            {Object.entries(memoriesByCategory).map(([category, items]) => {
              if (items.length === 0 && category === "Uncategorized") return null;
              const isUncategorized = category === "Uncategorized";
              return (
                <div key={category} className="space-y-3">
                  {/* Category header */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2 group/cat">
                    <h3 className="font-semibold text-lg text-primary/80">
                      {isUncategorized
                        ? <span className="text-muted-foreground italic text-base">Uncategorized</span>
                        : <InlineEdit value={category} onSave={n => renameCategory(category, n)}
                            className="font-semibold text-lg text-primary/80" />
                      }
                    </h3>
                    {!isUncategorized && (
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

                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground italic pl-1">Empty category — add a note or delete it.</p>
                  )}

                  {/* Memory items */}
                  <div className="grid gap-3">
                    {items.map(item => (
                      <Card key={item.id} className="bg-card hover-elevate group transition-colors">
                        <CardContent className="p-4 flex gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium leading-relaxed">{item.text}</p>
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
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => { setEditingMemory(item); setMemoryForm({ text: item.text, category: item.category, importanceLevel: item.importanceLevel }); setIsAddMemoryOpen(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => { if (confirm("Delete this memory?")) Storage.deleteMemory(item.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
            <div className="pt-2 border-t border-border/30">
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
            </div>
          </TabsContent>

          {/* ── UPDATE SESSION TAB ─────────────────────────────── */}
          <TabsContent value="update">
            {!reviewingSuggestions ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Process Session Transcript</h2>
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
                  <h2 className="text-lg font-semibold mb-4">Context Generator</h2>
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
                {generatedContext ? (
                  <>
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
                  </>
                ) : (
                  <div className="flex items-center justify-center min-h-[400px] border border-dashed rounded-lg text-muted-foreground text-center p-8">
                    <div>
                      <BrainCircuit className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Select categories and click Generate to build your context block.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
    </Layout>
  );
}
