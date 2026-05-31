import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useStorage, MemoryItem, generateId, AiSuggestion } from "@/lib/storage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  useAnalyzeSession, 
  useGenerateContextBlock 
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, Trash2, Edit2, Copy, Download, BrainCircuit, Sparkles, 
  Clock, CheckCircle2, XCircle, ArrowRight, RefreshCw, FileText
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function ProjectDetail() {
  const [match, params] = useRoute("/projects/:id");
  const [, setLocation] = useLocation();
  const { Storage } = useStorage();
  const { toast } = useToast();
  
  const projectId = params?.id || "";
  const project = Storage.getProject(projectId);
  const memories = Storage.getMemories(projectId);
  const history = Storage.getHistory(projectId);

  // States
  const [activeTab, setActiveTab] = useState("memory");
  
  // Memory specific states
  const [isAddMemoryOpen, setIsAddMemoryOpen] = useState(false);
  const [memoryForm, setMemoryForm] = useState({ text: "", category: "", importanceLevel: "useful-context" as MemoryItem["importanceLevel"] });
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null);

  // Update session states
  const [sessionNotes, setSessionNotes] = useState("");
  const [reviewingSuggestions, setReviewingSuggestions] = useState<AiSuggestion[] | null>(null);
  const [suggestionDecisions, setSuggestionDecisions] = useState<Record<number, "approve" | "reject">>({});
  
  // Context block states
  const [contextLength, setContextLength] = useState<"short" | "medium" | "full">("medium");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(project?.categories || []);
  const [includeArchive, setIncludeArchive] = useState(false);
  const [generatedContext, setGeneratedContext] = useState("");

  // Mutations
  const analyzeSession = useAnalyzeSession({
    mutation: {
      onSuccess: (result) => {
        setReviewingSuggestions(result.suggestions);
        setSuggestionDecisions({});
      },
      onError: (err) => {
        toast({
          title: "AI Review Failed",
          description: "Check your OpenAI API key or try again shortly.",
          variant: "destructive",
        });
      }
    }
  });

  const generateContext = useGenerateContextBlock({
    mutation: {
      onSuccess: (result) => {
        setGeneratedContext(result.content);
      },
      onError: () => {
        toast({
          title: "Generation Failed",
          description: "Check your OpenAI API key or try again shortly.",
          variant: "destructive",
        });
      }
    }
  });

  if (!project) return (
    <Layout>
      <div className="text-center py-20">Project not found</div>
    </Layout>
  );

  const memoriesByCategory = useMemo(() => {
    const grouped: Record<string, MemoryItem[]> = {};
    project.categories.forEach(c => grouped[c] = []);
    grouped["Uncategorized"] = [];
    
    memories.forEach(m => {
      if (grouped[m.category]) {
        grouped[m.category].push(m);
      } else {
        grouped["Uncategorized"].push(m);
      }
    });
    return grouped;
  }, [memories, project.categories]);

  // Handlers
  const handleSaveMemory = () => {
    if (!memoryForm.text || !memoryForm.category) return;
    
    const mem: MemoryItem = {
      id: editingMemory ? editingMemory.id : generateId(),
      projectId: project.id,
      text: memoryForm.text,
      category: memoryForm.category,
      importanceLevel: memoryForm.importanceLevel,
      createdAt: editingMemory ? editingMemory.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    Storage.saveMemory(mem);
    project.updatedAt = new Date().toISOString();
    Storage.saveProject(project);
    
    setIsAddMemoryOpen(false);
    setEditingMemory(null);
    setMemoryForm({ text: "", category: project.categories[0] || "", importanceLevel: "useful-context" });
  };

  const handleReviewSession = () => {
    if (!sessionNotes.trim()) return;
    
    const existingMemorySummary = memories.map(m => ({
      text: m.text,
      category: m.category,
      importanceLevel: m.importanceLevel
    }));
    
    analyzeSession.mutate({
      data: {
        projectName: project.name,
        projectType: project.type,
        categories: project.categories,
        existingMemory: existingMemorySummary,
        sessionNotes: sessionNotes
      }
    });
  };

  const finalizeReview = () => {
    if (!reviewingSuggestions) return;
    
    let approvedCount = 0;
    
    reviewingSuggestions.forEach((sug, idx) => {
      if (suggestionDecisions[idx] === "approve") {
        approvedCount++;
        Storage.saveMemory({
          id: generateId(),
          projectId: project.id,
          text: sug.suggestedText,
          category: sug.category,
          importanceLevel: sug.importanceLevel,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });
    
    Storage.saveHistory({
      id: generateId(),
      projectId: project.id,
      rawNotes: sessionNotes,
      suggestions: reviewingSuggestions,
      approvedCount,
      createdAt: new Date().toISOString()
    });
    
    project.updatedAt = new Date().toISOString();
    Storage.saveProject(project);
    
    setReviewingSuggestions(null);
    setSessionNotes("");
    setActiveTab("memory");
    
    toast({
      title: "Session Processed",
      description: `Added ${approvedCount} new context items.`,
    });
  };

  const handleGenerateContext = () => {
    const relevantMemories = memories
      .filter(m => selectedCategories.includes(m.category))
      .filter(m => includeArchive || m.importanceLevel !== 'archive-reference')
      .map(m => ({
        text: m.text,
        category: m.category,
        importanceLevel: m.importanceLevel
      }));
      
    generateContext.mutate({
      data: {
        projectName: project.name,
        projectType: project.type,
        length: contextLength,
        selectedCategories,
        includeArchive,
        memoryItems: relevantMemories
      }
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContext);
    toast({ title: "Copied to clipboard" });
  };

  const downloadTxt = () => {
    const element = document.createElement("a");
    const file = new Blob([generatedContext], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-context.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <Badge variant="outline" className="font-mono bg-background">{project.type}</Badge>
            </div>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="mr-1 h-3 w-3" />
              Last updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
              <span className="mx-2">•</span>
              <Database className="mr-1 h-3 w-3" />
              {memories.length} items
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (confirm('Delete this project?')) {
                Storage.deleteProject(project.id);
                setLocation("/");
              }
            }}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px] mb-8 h-12">
            <TabsTrigger value="memory" className="text-sm">Memory Bank</TabsTrigger>
            <TabsTrigger value="update" className="text-sm">Log Session</TabsTrigger>
            <TabsTrigger value="context" className="text-sm">Get Context</TabsTrigger>
            <TabsTrigger value="history" className="text-sm">History</TabsTrigger>
          </TabsList>

          {/* MEMORY TAB */}
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
                      <Textarea 
                        value={memoryForm.text}
                        onChange={e => setMemoryForm({...memoryForm, text: e.target.value})}
                        className="min-h-[100px]"
                        placeholder="e.g. We decided to drop the React Native build in favor of PWA."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={memoryForm.category} onValueChange={v => setMemoryForm({...memoryForm, category: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {project.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Importance</Label>
                        <Select value={memoryForm.importanceLevel} onValueChange={(v: any) => setMemoryForm({...memoryForm, importanceLevel: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="must-include">Must Include (Rules)</SelectItem>
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

            {Object.entries(memoriesByCategory).map(([category, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={category} className="space-y-3">
                  <h3 className="font-semibold text-lg border-b border-border/50 pb-2 text-primary/80">{category}</h3>
                  <div className="grid gap-3">
                    {items.map(item => (
                      <Card key={item.id} className="bg-card hover-elevate group transition-colors">
                        <CardContent className="p-4 flex gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium leading-relaxed">{item.text}</p>
                            <div className="flex items-center gap-2 mt-3">
                              <Badge variant={item.importanceLevel === 'must-include' ? 'destructive' : item.importanceLevel === 'archive-reference' ? 'outline' : 'secondary'} className="text-[10px]">
                                {item.importanceLevel.replace('-', ' ')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{format(new Date(item.updatedAt), 'MMM d')}</span>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => {
                              setEditingMemory(item);
                              setMemoryForm({ text: item.text, category: item.category, importanceLevel: item.importanceLevel });
                              setIsAddMemoryOpen(true);
                            }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => {
                              if(confirm('Delete this memory?')) { Storage.deleteMemory(item.id); setLocation(location); }
                            }}>
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
            
            {memories.length === 0 && (
              <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
                No memories yet. Paste a session log or add a manual note.
              </div>
            )}
          </TabsContent>

          {/* UPDATE SESSION TAB */}
          <TabsContent value="update">
            {!reviewingSuggestions ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Process Session Transcript</h2>
                  <p className="text-muted-foreground text-sm">Paste the conversation or notes from your latest AI session. The system will extract facts and updates.</p>
                </div>
                <Textarea 
                  placeholder="Paste chat logs, commit notes, or random thoughts here..."
                  className="min-h-[400px] font-mono text-sm leading-relaxed p-4"
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                />
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg" 
                  onClick={handleReviewSession}
                  disabled={!sessionNotes.trim() || analyzeSession.isPending}
                >
                  {analyzeSession.isPending ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <BrainCircuit className="mr-2 h-5 w-5" />}
                  {analyzeSession.isPending ? "Analyzing Transcript..." : "Extract Insights"}
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
                    <Card key={idx} className={`border-2 transition-colors ${suggestionDecisions[idx] === 'approve' ? 'border-primary bg-primary/5' : suggestionDecisions[idx] === 'reject' ? 'border-destructive/30 opacity-50' : 'border-border'}`}>
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
                              <div className="bg-destructive/10 text-destructive-foreground p-2 rounded text-sm mt-2 border border-destructive/20">
                                <strong>Conflict Detected:</strong> {sug.conflictNote}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 justify-start border-l border-border/50 pl-4">
                            <Button 
                              variant={suggestionDecisions[idx] === 'approve' ? 'default' : 'outline'} 
                              size="sm"
                              className="w-24"
                              onClick={() => setSuggestionDecisions(prev => ({...prev, [idx]: 'approve'}))}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" /> Keep
                            </Button>
                            <Button 
                              variant={suggestionDecisions[idx] === 'reject' ? 'destructive' : 'outline'} 
                              size="sm"
                              className="w-24"
                              onClick={() => setSuggestionDecisions(prev => ({...prev, [idx]: 'reject'}))}
                            >
                              <XCircle className="mr-1 h-4 w-4" /> Discard
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {reviewingSuggestions.length === 0 && (
                    <div className="text-center p-12 text-muted-foreground border rounded">
                      No extractable facts found in that transcript.
                    </div>
                  )}
                </div>
                
                <div className="sticky bottom-4 p-4 bg-background/95 backdrop-blur border rounded-lg shadow-xl flex justify-between items-center mt-8">
                  <div className="text-sm font-medium">
                    {Object.values(suggestionDecisions).filter(v => v === 'approve').length} selected for injection
                  </div>
                  <Button size="lg" onClick={finalizeReview} disabled={Object.keys(suggestionDecisions).length === 0}>
                    Commit to Memory <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* CONTEXT BLOCK TAB */}
          <TabsContent value="context" className="space-y-6">
            <div className="grid md:grid-cols-[300px_1fr] gap-8">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Context Generator</h2>
                  <p className="text-sm text-muted-foreground mb-6">Compile your memories into an optimized system prompt.</p>
                </div>
                
                <div className="space-y-3">
                  <Label>Length Target</Label>
                  <Select value={contextLength} onValueChange={(v: any) => setContextLength(v)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
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
                        <Checkbox 
                          id={`cat-${cat}`} 
                          checked={selectedCategories.includes(cat)}
                          onCheckedChange={(checked) => {
                            if(checked) setSelectedCategories([...selectedCategories, cat]);
                            else setSelectedCategories(selectedCategories.filter(c => c !== cat));
                          }}
                        />
                        <label htmlFor={`cat-${cat}`} className="text-sm font-medium leading-none cursor-pointer">
                          {cat}
                        </label>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
                
                <div className="flex items-center space-x-2 pt-2 border-t border-border/50">
                  <Checkbox 
                    id="archive" 
                    checked={includeArchive}
                    onCheckedChange={(c: boolean) => setIncludeArchive(c)}
                  />
                  <label htmlFor="archive" className="text-sm font-medium">Include Archived Items</label>
                </div>
                
                <Button 
                  className="w-full mt-4" 
                  onClick={handleGenerateContext}
                  disabled={generateContext.isPending || memories.length === 0}
                >
                  {generateContext.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Compile Block
                </Button>
              </div>
              
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <Label>Compiled Output</Label>
                  {generatedContext && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4 mr-2" /> Copy
                      </Button>
                      <Button variant="secondary" size="sm" onClick={downloadTxt}>
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                    </div>
                  )}
                </div>
                <div className="relative flex-1 min-h-[500px] bg-muted/30 border rounded-lg p-1 overflow-hidden">
                  {generateContext.isPending && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="flex flex-col items-center">
                        <RefreshCw className="h-8 w-8 text-primary animate-spin mb-4" />
                        <span className="font-mono text-sm">Synthesizing...</span>
                      </div>
                    </div>
                  )}
                  {generatedContext ? (
                    <Textarea 
                      readOnly 
                      value={generatedContext} 
                      className="h-full w-full font-mono text-sm resize-none border-0 focus-visible:ring-0 bg-transparent p-4"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                      {memories.length === 0 ? "No memories available to compile." : "// output will appear here"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Session History</h2>
              
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
                    No sessions logged yet.
                  </div>
                ) : (
                  history.map(session => (
                    <Card key={session.id}>
                      <CardHeader className="py-4 flex flex-row items-center justify-between border-b">
                        <div>
                          <CardTitle className="text-base flex items-center">
                            <FileText className="h-4 w-4 mr-2 text-primary" />
                            Session on {format(new Date(session.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </CardTitle>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          {session.approvedCount} facts extracted
                        </Badge>
                      </CardHeader>
                      <CardContent className="py-4">
                        <div className="text-sm font-mono text-muted-foreground line-clamp-3 bg-muted/30 p-3 rounded">
                          {session.rawNotes}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}

// Mock icon that was missing in imports
function Database(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>;
}
