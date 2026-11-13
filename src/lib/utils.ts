import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}
