"use client";

import { startTransition, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withoutThemeTransitions } from "@/lib/disable-theme-transitions";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {options.map((opt) => (
          <div
            key={opt.value}
            className="h-8 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.value;
        return (
          <Button
            key={opt.value}
            variant="outline"
            size="sm"
            onClick={() => {
              withoutThemeTransitions(() => {
                startTransition(() => setTheme(opt.value));
              });
            }}
            className={cn(
              "h-8 px-2 text-xs",
              isActive && "bg-accent text-accent-foreground"
            )}
            title={opt.label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
