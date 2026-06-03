import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CreateProject from "@/pages/projects/new";
import ProjectDetail from "@/pages/projects/[id]";
import HelpPage from "@/pages/help";
import { OnboardingModal } from "@/components/onboarding-modal";
import { shouldShowOnboarding } from "@/lib/onboarding";
import { seedDemoProject } from "@/lib/demo-project";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/projects/new" component={CreateProject} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/help" component={HelpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());

  useEffect(() => {
    seedDemoProject();
  }, []);

  useEffect(() => {
    const handler = () => setShowOnboarding(true);
    window.addEventListener("orgainise:restart-tutorial", handler);
    return () => window.removeEventListener("orgainise:restart-tutorial", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
