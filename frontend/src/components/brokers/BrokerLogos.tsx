"use client";

import React from "react";

export function KiteLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#FF5722" />
      {/* Official Zerodha Kite Geometry */}
      <path d="M20 7L33 20L20 33L7 20L20 7Z" fill="white" />
      <path d="M20 12.5L27.5 20L20 27.5L12.5 20L20 12.5Z" fill="#FF5722" />
      <path d="M20 16.5L23.5 20L20 23.5L16.5 20L20 16.5Z" fill="white" />
    </svg>
  );
}

export function UpstoxLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#6C2BD9" />
      {/* Official Upstox 'u' Brand Mark */}
      <path
        d="M12 11V21.5C12 25.6421 15.3579 29 19.5 29C23.6421 29 27 25.6421 27 21.5V11H22.5V21.5C22.5 23.1569 21.1569 24.5 19.5 24.5C17.8431 24.5 16.5 23.1569 16.5 21.5V11H12Z"
        fill="white"
      />
      <circle cx="24.75" cy="13.25" r="2.25" fill="#38BDF8" />
    </svg>
  );
}

export function KotakNeoLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#DA251C" />
      {/* Official Kotak Infinity Wing */}
      <path
        d="M11 29V11L20 20V11L29 20V29L20 20V29L11 29Z"
        fill="white"
      />
      <circle cx="28" cy="12" r="2.5" fill="#FFCC00" />
    </svg>
  );
}

export function AngelOneLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#FF5200" />
      {/* Official Angel One Wing & Spark */}
      <path d="M20 8L31 29H25.5L20 19L14.5 29H9L20 8Z" fill="white" />
      <circle cx="20" cy="22.5" r="3" fill="#00A3FF" />
    </svg>
  );
}

export function GrowwLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#00D09C" />
      {/* Official Groww Trend Curve & Arrow */}
      <path
        d="M9 27L17 18.5L22 23.5L30.5 12"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 12H30.5V18.5"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ICICIDirectLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#052A56" />
      {/* Official ICICI Orange Band */}
      <rect x="8" y="10" width="7" height="20" rx="1.5" fill="#F37023" />
      <path
        d="M18 10H27C29.7614 10 32 12.2386 32 15V25C32 27.7614 29.7614 30 27 30H18V10Z"
        fill="white"
      />
    </svg>
  );
}

export function DhanLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#00C853" />
      {/* Official Dhan D Mark */}
      <path d="M12 10H20C24.9706 10 29 14.0294 29 19C29 23.9706 24.9706 28 20 28H12V10Z" fill="white" />
      <path d="M17 15H20C22.2091 15 24 16.7909 24 19C24 21.2091 22.2091 23 20 23H17V15Z" fill="#00C853" />
    </svg>
  );
}

export function FivePaisaLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#0F172A" />
      {/* Official 5paisa Emblem */}
      <path d="M11 10H28V15H17V18.5H28V28H11V23H22V18.5H11V10Z" fill="#FF9900" />
    </svg>
  );
}

export function YahooFinanceLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#6001D2" />
      {/* Official Yahoo Finance Y Mark */}
      <path d="M11 10L18.5 21.5V30H22.5V21.5L30 10H25.2L20.5 18L15.8 10H11Z" fill="white" />
    </svg>
  );
}

export function BrokerLogo({ brokerKey, className = "h-4 w-4" }: { brokerKey: string; className?: string }) {
  const key = (brokerKey || "").toLowerCase();
  if (key === "kite" || key === "zerodha") return <KiteLogo className={className} />;
  if (key === "upstox") return <UpstoxLogo className={className} />;
  if (key === "kotak_neo" || key === "kotak" || key === "kotakneo") return <KotakNeoLogo className={className} />;
  if (key === "angel" || key === "angelone") return <AngelOneLogo className={className} />;
  if (key === "groww") return <GrowwLogo className={className} />;
  if (key === "icici" || key === "icicidirect") return <ICICIDirectLogo className={className} />;
  if (key === "dhan") return <DhanLogo className={className} />;
  if (key === "fivepaisa" || key === "5paisa") return <FivePaisaLogo className={className} />;
  if (key === "yfinance" || key === "yahoo") return <YahooFinanceLogo className={className} />;

  return (
    <div className={`rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] ${className}`}>
      {key.slice(0, 2).toUpperCase()}
    </div>
  );
}

