"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/theme/MainContent";

/** Keep the authentication screen outside the authenticated application shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <main className="flex-1 min-h-screen bg-background">{children}</main>;
  }
  return (
    <>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </>
  );
}
