import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, ArrowRight, Save, LayoutTemplate, PackagePlus } from "lucide-react";
import { generateId, Project } from "@/lib/storage";
import { STANDARD_WRITING_CATEGORY_NAMES, GENRE_PACKS, STANDARD_WRITING_CATEGORIES } from "@/lib/writing-categories";
import { useSyncedStorage as useStorage } from "@/lib/synced-storage";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

const PROJECT_TYPES = [
  "Coding / App Build",
  "Writing / Worldbuilding",
  "Business / Startup",
  "Research / Learning",
  "Trading / Investing",
  "Personal / Life",
  "Custom",
] as const;

const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  "Coding / App Build": [
    "Architecture",
    "Tech Stack",
    "Current Sprint",
    "Key Decisions",
    "Open Questions",
    "Known Issues",
    "Future Ideas",
  ],
  "Writing / Worldbuilding": STANDARD_WRITING_CATEGORY_NAMES,
  "Business / Startup": [
    "Business Model",
    "Target Market",
    "Current Focus",
    "Key Decisions",
    "Open Questions",
    "Risks",
    "Ideas",
  ],
  "Research / Learning": [
    "Core Concepts",
    "Key Findings",
    "Sources",
    "Open Questions",
    "Notes",
    "Ideas to Explore",
  ],
  "Trading / Investing": [
    "Strategy",
    "Assets Tracked",
    "Rules & Limits",
    "Active Positions",
    "Lessons Learned",
    "Watchlist",
  ],
  "Personal / Life": [
    "Goals",
    "Current Focus",
    "Decisions Made",
    "Open Questions",
    "Reflections",
    "Ideas",
  ],
  "Custom": [
    "Project Summary",
    "Core Rules",
    "Current Direction",
    "Recent Decisions",
    "Open Questions",
    "Notes",
  ],
};

const step1Schema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters").max(64),
  type: z.string().min(1, "Please select a project type"),
  customType: z.string().optional(),
});

export default function CreateProject() {
  const [, setLocation] = useLocation();
  const { Storage }     = useStorage();
  const { toast }       = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [appliedGenrePacks, setAppliedGenrePacks] = useState<Set<string>>(new Set());
  const [expandedPack, setExpandedPack] = useState<string | null>(null);

  const form = useForm<z.infer<typeof step1Schema>>({
    resolver: zodResolver(step1Schema),
    defaultValues: { name: "", type: "Coding / App Build", customType: "" },
  });

  const selectedType = form.watch("type");
  const isCustom     = selectedType === "Custom";

  function onStep1Submit() {
    const type = form.getValues("type");
    setCategories(CATEGORIES_BY_TYPE[type] ?? CATEGORIES_BY_TYPE["Custom"]);
    setAppliedGenrePacks(new Set());
    setExpandedPack(null);
    setStep(2);
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const t = newCategory.trim();
    if (t && !categories.includes(t)) {
      setCategories(prev => [...prev, t]);
      setNewCategory("");
    }
  }

  function handleRemoveCategory(cat: string) {
    setCategories(prev => prev.filter(c => c !== cat));
  }

  function handleApplyGenrePack(packName: string) {
    const packCats = GENRE_PACKS[packName] ?? [];
    setCategories(prev => {
      const toAdd = packCats.filter(c => !prev.includes(c));
      return [...prev, ...toAdd];
    });
    setAppliedGenrePacks(prev => new Set([...prev, packName]));
  }

  function handleSaveProject() {
    const values    = form.getValues();
    const finalType = values.type === "Custom" ? (values.customType || "Custom") : values.type;

    const newProject: Project = {
      id: generateId(),
      name: values.name,
      type: finalType,
      categories: categories.length > 0 ? categories : ["General"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log(`[OrgAInise] Creating project id="${newProject.id}" name="${newProject.name}" using key="orgainise_projects"`);
    Storage.saveProject(newProject);
    console.log(`[OrgAInise] Project saved. Navigating to /projects/${newProject.id}`);
    toast({ title: "Project saved successfully", description: `"${newProject.name}" is ready. Log sessions and build memory.` });
    setLocation(`/projects/${newProject.id}`);
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Initialize Workspace</h1>
          <p className="text-muted-foreground mt-2">Configure a new context boundary for your AI sessions.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {[1, 2].map(n => (
            <div key={n} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === n ? "bg-primary text-primary-foreground" : step > n ? "bg-primary/30 text-primary" : "bg-muted text-muted-foreground"
              }`}>{n}</div>
              {n < 2 && <div className={`h-px w-8 transition-colors ${step > n ? "bg-primary/50" : "bg-border"}`} />}
            </div>
          ))}
          <span className="text-sm text-muted-foreground ml-1">{step === 1 ? "Project Identity" : "Memory Schema"}</span>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Project Identity</CardTitle>
                  <CardDescription>Name your workspace and define its purpose.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onStep1Submit)} className="space-y-6">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Project Apollo" {...field} className="text-lg py-6" autoFocus />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Domain / Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="py-6">
                                <SelectValue placeholder="Select a domain" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PROJECT_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                          {/* Preview the default categories for the selected type */}
                          {selectedType && CATEGORIES_BY_TYPE[selectedType] && (
                            <motion.div
                              key={selectedType}
                              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                <LayoutTemplate className="h-3 w-3" />
                                Default categories for this type:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {CATEGORIES_BY_TYPE[selectedType].map(cat => (
                                  <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </FormItem>
                      )} />

                      {isCustom && (
                        <FormField control={form.control} name="customType" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Custom Type Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Game Development" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}

                      <div className="flex justify-end pt-4">
                        <Button type="submit" size="lg" className="w-full sm:w-auto">
                          Configure Categories <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Memory Schema</CardTitle>
                  <CardDescription>
                    These categories define how your AI files information. Pre-filled for <span className="text-foreground font-medium">{form.getValues("type")}</span> — remove, rename, or add as needed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 bg-muted/30 rounded-lg border border-border/50 min-h-[80px]">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                      <LayoutTemplate className="h-4 w-4" />
                      Active Categories
                      <span className="ml-auto text-xs font-normal">{categories.length} total</span>
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat, i) => (
                        <motion.span
                          key={cat}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-background border border-border text-sm"
                        >
                          {cat}
                          <button onClick={() => handleRemoveCategory(cat)}
                            className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </motion.span>
                      ))}
                      {categories.length === 0 && (
                        <span className="text-sm text-muted-foreground italic">No categories — AI will use a general bucket.</span>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleAddCategory} className="flex gap-2">
                    <Input
                      placeholder="Add a category (e.g. API Keys)"
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                    />
                    <Button type="submit" variant="secondary">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </form>

                  {selectedType === "Writing / Worldbuilding" && (
                    <div className="border-t border-border/50 pt-4 space-y-3">
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground mb-1">
                          <PackagePlus className="h-4 w-4" /> Genre Packs
                        </h4>
                        <p className="text-xs text-muted-foreground mb-3">Add optional genre-specific categories to your project.</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(GENRE_PACKS).map(([packName, packCats]) => {
                            const applied = appliedGenrePacks.has(packName);
                            const isExpanded = expandedPack === packName;
                            return (
                              <div key={packName} className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => !applied && handleApplyGenrePack(packName)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                      applied
                                        ? "bg-primary/10 border-primary/30 text-primary cursor-default"
                                        : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground cursor-pointer"
                                    }`}
                                  >
                                    {applied ? "✓ " : "+ "}{packName}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedPack(isExpanded ? null : packName)}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
                                    title="Preview categories"
                                  >
                                    {isExpanded ? "▲" : "▼"}
                                  </button>
                                </div>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                    className="ml-1 flex flex-wrap gap-1"
                                  >
                                    {packCats.map(c => (
                                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border/40">{c}</span>
                                    ))}
                                  </motion.div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border-t border-border/30 pt-3">
                        <p className="text-xs text-muted-foreground mb-2 font-medium">Standard category guide</p>
                        <div className="grid gap-1">
                          {STANDARD_WRITING_CATEGORIES.map(def => (
                            <div key={def.name} className="text-xs flex gap-2">
                              <span className="font-medium text-foreground w-32 shrink-0">{def.name}</span>
                              <span className="text-muted-foreground">{def.purpose}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex items-center justify-between border-t border-border/50">
                    <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
                    <Button size="lg" onClick={handleSaveProject}>
                      <Save className="mr-2 h-4 w-4" /> Finalize Workspace
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
