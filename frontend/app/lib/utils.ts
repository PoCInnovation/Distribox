import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatGB(gb: number, decimals = 2): string {
  return `${gb.toFixed(decimals)} GB`;
}
