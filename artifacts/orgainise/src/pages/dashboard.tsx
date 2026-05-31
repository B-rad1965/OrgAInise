import { useStorage } from "@/lib/storage";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BrainCircuit, Database, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { Storage } = useStorage();
  const projects = Storage.getProjects();
  const memories = Storage.getMemories();

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
              <Button size="lg" className="h-12 px-8 font-medium">
                <Plus className="mr-2 h-5 w-5" />
                Initialize Workspace
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((project, idx) => {
              const projectMemories = memories.filter(m => m.projectId === project.id);
              
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link href={`/projects/${project.id}`}>
                    <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer group hover-elevate">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-xl group-hover:text-primary transition-colors line-clamp-1">{project.name}</CardTitle>
                          <Badge variant="secondary" className="font-mono text-xs">{project.type}</Badge>
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
                            {projectMemories.length} memories
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
          </div>
        )}
      </div>
    </Layout>
  );
}
