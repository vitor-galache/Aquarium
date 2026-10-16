import type { ReactNode } from "react";

export function LayerChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 rounded-chip bg-highlight px-[9px] py-1 text-xs font-semibold whitespace-nowrap text-brand">
      {children}
    </span>
  );
}
