import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, ArrowRight, Save, LayoutTemplate, Badge } from "lucide-react";
import { generateId, useStorage, Project } from "@/lib/storage";
import { motion, AnimatePresence } from "framer-motion";

const PROJECT_TYPES = [
  'Writing / Worldbuilding',
  'Business / Startup',
  'Research / Learning',
  'Coding / App Build',
  'Trading / Investing',
  'Personal / Life',
  'Custom'
];

const DEFAULT_CATEGORIES = [
  'Project Summary',
  'Core Rules',
  'Current Direction',
  'Recent Decisions',
  'Open Questions',
  'Important Details',
  'Ideas to Explore',
  'Manual Notes'
];

const step1Schema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters").max(64),
  type: z.string().min(1, "Please select a project type"),
  customType: z.string().optional()
});

export default function CreateProject() {
  const [, setLocation] = useLocation();
  const { Storage } = useStorage();
  const [step, setStep] = useState<1 | 2>(1);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");

  const form = useForm<z.infer<typeof step1Schema>>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      name: "",
      type: "Coding / App Build",
      customType: ""
    }
  });

  const isCustom = form.watch("type") === "Custom";

  function onStep1Submit() {
    setStep(2);
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory("");
    }
  }

  function handleRemoveCategory(categoryToRemove: string) {
    setCategories(categories.filter(c => c !== categoryToRemove));
  }

  function handleSaveProject() {
    const values = form.getValues();
    const finalType = values.type === "Custom" ? (values.customType || "Custom") : values.type;
    
    const newProject: Project = {
      id: generateId(),
      name: values.name,
      type: finalType,
      categories: categories.length > 0 ? categories : ["General"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    Storage.saveProject(newProject);
    setLocation(`/projects/${newProject.id}`);
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Initialize Workspace</h1>
          <p className="text-muted-foreground mt-2">Configure a new context boundary for your AI sessions.</p>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <span className="bg-primary/20 text-primary h-6 w-6 rounded-full flex items-center justify-center text-sm mr-2">1</span>
                      Project Identity
                    </CardTitle>
                    <CardDescription>Name your workspace and define its purpose.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onStep1Submit)} className="space-y-6">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Project Name</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Project Apollo" {...field} className="text-lg py-6" autoFocus />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="type"
                          render={({ field }) => (
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
                            </FormItem>
                          )}
                        />

                        {isCustom && (
                          <FormField
                            control={form.control}
                            name="customType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Custom Type Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Game Development" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <span className="bg-primary/20 text-primary h-6 w-6 rounded-full flex items-center justify-center text-sm mr-2">2</span>
                      Memory Schema
                    </CardTitle>
                    <CardDescription>
                      How do you want to organize your context? These will be the categories your AI uses to file information.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                      <h4 className="text-sm font-medium mb-3 flex items-center">
                        <LayoutTemplate className="h-4 w-4 mr-2" />
                        Active Categories
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                          <Badge key={cat} variant="secondary" className="px-3 py-1 text-sm bg-background border-border flex items-center gap-1 group">
                            {cat}
                            <button 
                              onClick={() => handleRemoveCategory(cat)}
                              className="ml-1 text-muted-foreground hover:text-destructive focus:outline-none"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {categories.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">No categories defined. AI will use a general bucket.</span>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleAddCategory} className="flex gap-2">
                      <Input 
                        placeholder="Add new category (e.g. API Keys)" 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                      />
                      <Button type="submit" variant="secondary">Add</Button>
                    </form>

                    <div className="pt-4 flex items-center justify-between border-t border-border/50">
                      <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
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
      </div>
    </Layout>
  );
}
