import { Link } from "wouter";
import { Plus, BrainCircuit, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between mx-auto px-4 md:px-8">
          <Link href="/" className="flex items-center space-x-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <span className="font-bold tracking-tight text-lg">OrgAInise</span>
          </Link>
          
          <div className="flex items-center space-x-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="hidden md:flex">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button size="sm" variant="default">
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">New Project</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-screen-xl mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
