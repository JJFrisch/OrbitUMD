import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function BottomSheet({ open, title, onClose, children, className }: BottomSheetProps) {
  if (!open) return null;

  return (
    <>
      <button className="cp-sheet-backdrop" type="button" onClick={onClose} aria-label="Close details overlay" />
      <section className={cn("cp-bottom-sheet", className)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="cp-bottom-sheet-header">
          <strong>{title}</strong>
          <button type="button" className="cp-sheet-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="cp-bottom-sheet-content">{children}</div>
      </section>
    </>
  );
}
