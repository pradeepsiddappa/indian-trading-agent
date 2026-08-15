"use client";

import { memo } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";

export const ThemedToaster = memo(function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
});
