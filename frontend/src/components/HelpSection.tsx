"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { infoSubtle, infoBorder } from "@/lib/status-colors";

interface HelpItem {
  question: string;
  answer: string;
}

interface Props {
  title?: string;
  items: HelpItem[];
}

export function HelpSection({ title = "Help & Guide", items }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <Card className={infoSubtle()}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className={`border ${infoBorder()} rounded-lg overflow-hidden`}>
              <button
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                className="w-full text-left p-3 flex items-center justify-between hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
              >
                <span className="text-sm font-medium">{item.question}</span>
                {expandedIndex === i ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
              </button>
              {expandedIndex === i && (
                <div className="px-3 pb-3 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
