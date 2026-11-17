import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** The message of a thrown value, or `fallback` when it has none. */
export function errorMessage(error: unknown, fallback: string): string {
  return (error instanceof Error && error.message) || fallback;
}
