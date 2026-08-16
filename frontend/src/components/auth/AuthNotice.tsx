"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const AUTH_REQUIRED_EVENT = "trading-agent:auth-required";
const WEBSOCKET_UNAVAILABLE_EVENT = "trading-agent:websocket-unavailable";

/** Surface session failures without exposing response bodies or backend details. */
export function AuthNotice() {
  useEffect(() => {
    const handleAuthRequired = () => {
      if (window.location.pathname === "/login") return;
      toast.error("Authentication required. Sign in to continue.", {
        action: {
          label: "Sign in",
          onClick: () => window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`),
        },
      });
    };
    const handleWebSocketUnavailable = () => {
      toast.error("Live updates are unavailable. Check your session or connection.");
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    window.addEventListener(WEBSOCKET_UNAVAILABLE_EVENT, handleWebSocketUnavailable);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
      window.removeEventListener(WEBSOCKET_UNAVAILABLE_EVENT, handleWebSocketUnavailable);
    };
  }, []);

  return null;
}
