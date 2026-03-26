import { createPortal } from "react-dom";
import type { RefObject } from "react";

interface ProjectedTimesPopoverProps {
  anchorRef: RefObject<HTMLElement>;
  visible: boolean;
  onClose: () => void;
}

export function ProjectedTimesPopover({ anchorRef, visible, onClose }: ProjectedTimesPopoverProps) {
  if (!visible || !anchorRef.current) return null;

  const rect = anchorRef.current.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 16);
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  const top = Math.min(rect.bottom + 8, window.innerHeight - 150);

  const popover = (
    <div
      className="cp-projected-times-popover"
      role="dialog"
      aria-label="Projected times information"
      style={{
        position: "fixed",
        top,
        left,
        width,
        zIndex: 99999,
      }}
    >
      <button
        type="button"
        className="cp-projected-times-popover-close"
        aria-label="Close projected times information"
        onClick={onClose}
      >
        ✕
      </button>
      <strong>Projected Times</strong>
      <span>
        This term is using projected catalog data based on current and historical patterns.
        Actual classes and meeting times may change when the official schedule is released.
      </span>
    </div>
  );

  const portalRoot = document.body;
  return createPortal(popover, portalRoot);
}
