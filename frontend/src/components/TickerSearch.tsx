"use client";

import { useState, useEffect, useRef } from "react";
import { searchStocks } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (ticker: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface StockResult {
  ticker: string;
  name: string;
  symbol: string;
}

export function TickerSearch({ value, onChange, placeholder, disabled, className }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<StockResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data: any = await searchStocks(val.trim());
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  };

  const handleSelect = (ticker: string) => {
    setQuery(ticker);
    onChange(ticker);
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder={placeholder || "Search stock (e.g., Infosys, RELIANCE)"}
        disabled={disabled}
        className={`font-sans ${className || ""}`}
      />
      {showDropdown && (
        <div className="absolute z-50 w-full min-w-[300px] mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-auto">
          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => handleSelect(r.ticker)}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="font-sans font-semibold">{r.ticker}</span>
                <span className="text-muted-foreground ml-2">{r.name}</span>
              </span>
              <span className="text-xs text-muted-foreground flex-none">{r.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
