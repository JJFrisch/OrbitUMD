import type { MouseEvent } from "react";
import { getPlanetTerpUrlForProfessor, formatRatingStars } from "../../utils/professors";

interface ProfessorLinkProps {
  name: string;
  slug?: string;
  rating?: number;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onMouseDown?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function ProfessorLink({ name, slug, rating, className, onClick, onMouseDown }: ProfessorLinkProps) {
  const safeName = name?.trim() || "Staff";
  const hasRating = rating !== undefined && Number.isFinite(rating);

  return (
    <a
      className={className ?? "cp-prof-link"}
      href={getPlanetTerpUrlForProfessor(safeName, slug)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      onMouseDown={onMouseDown}
      aria-label={safeName}
    >
      <span>{safeName}</span>
      <span className={`cp-prof-stars ${hasRating ? "" : "is-muted"}`}>
        {formatRatingStars(hasRating ? rating : undefined)}
      </span>
      {!hasRating && <span className="cp-prof-rating-na">N/A</span>}
    </a>
  );
}
