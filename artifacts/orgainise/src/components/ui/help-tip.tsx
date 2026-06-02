import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpTipProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function HelpTip({ text, side = "top" }: HelpTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Help"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors focus:outline-none"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-sm leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
