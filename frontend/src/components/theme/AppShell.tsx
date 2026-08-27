"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/theme/MainContent";
import { getAuthStatus } from "@/lib/api";

/** Keep the authentication screen outside the authenticated application shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorizedPath, setAuthorizedPath] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;

    let active = true;
    getAuthStatus()
      .then((result) => {
        if (!active) return;
        if (result.authenticated) {
          setAuthorizedPath(pathname);
        } else {
          router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
        }
      })
      .catch(() => {
        if (active) router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (pathname === "/login") {
    return <main className="flex-1 min-h-screen bg-background">{children}</main>;
  }
  if (authorizedPath !== pathname) {
    return <main className="flex-1 min-h-screen bg-background" aria-busy="true" />;
  }
  return (
    <>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </>
  );
}
