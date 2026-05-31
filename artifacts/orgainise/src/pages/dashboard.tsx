import { useState, useMemo } from "react";
import { useStorage } from "@/lib/storage";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BrainCircuit, Database, Clock, Search, ArrowUpDown, AlarmClock, ArrowDownAZ, CalendarClock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortOption = "recently-updated" | "alphabetical" | "recently-created";

const SORT_LABELS: Record<SortOption, { label: string; icon: React.ReactNode }> = {
  "recently-updated": { label: "Recently Updated", icon: <AlarmClock className="h-3.5 w-3.5" /> },
  "alphabetical": { label: "Alphabetical", icon: <ArrowDownAZ className="h-3.5 w-3.5" /> },
  "recently-created": { label: "Recently Created", icon: <CalendarClock className="h-3.5 w-3.5" /> },
};

export default function Dashboard() {
  const { Storage } = useStorage();
  const projects = Storage.getProjects();
  const memories = Storage.getMemories();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("recently-updated");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q)
        )
      : [...projects];

    if (sort === "recently-updated") {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sort === "alphabetical") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "recently-created") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list;
  }, [projects, search, sort]);

  return (
    <Layout>
      <div className="flex flex-col space-y-8 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Command Centre</h1>
            <p className="text-muted-foreground mt-1">Keep your projects organized and your AI up to speed.</p>
          </div>
        </div>

        {projects.length === 0 ? (
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
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    data-testid="button-sort-projects"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{SORT_LABELS[sort].label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(v) => setSort(v as SortOption)}
                  >
                    {(Object.entries(SORT_LABELS) as [SortOption, typeof SORT_LABELS[SortOption]][]).map(([value, { label, icon }]) => (
                      <DropdownMenuRadioItem
                        key={value}
                        value={value}
                        className="gap-2"
                        data-testid={`sort-option-${value}`}
                      >
                        {icon}
                        {label}
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
                  <button
                    className="text-sm text-primary mt-2 hover:underline"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="grid"
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                >
                  {filtered.map((project, idx) => {
                    const projectMemories = memories.filter((m) => m.projectId === project.id);

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
                              <div className="flex justify-between items-start">
                                <CardTitle className="text-xl group-hover:text-primary transition-colors line-clamp-1">
                                  {project.name}
                                </CardTitle>
                                <Badge variant="secondary" className="font-mono text-xs shrink-0 ml-2">
                                  {project.type}
                                </Badge>
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
      </div>
    </Layout>
  );
}
