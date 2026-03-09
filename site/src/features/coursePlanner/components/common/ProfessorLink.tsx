import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import {
  formatRatingStars,
  getPlanetTerpUrlForProfessor,
  resolvePlanetTerpProfessorMetaByName,
} from "../../utils/professors";

interface ProfessorLinkProps {
  name: string;
  slug?: string;
  rating?: number | string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onMouseDown?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function ProfessorLink({ name, slug, rating, className, onClick, onMouseDown }: ProfessorLinkProps) {
  const safeName = name?.trim() || "Staff";
  const parsedIncomingRating = typeof rating === "number" ? rating : Number(rating);
  const [resolvedSlug, setResolvedSlug] = useState<string | undefined>(slug);
  const [resolvedRating, setResolvedRating] = useState<number | undefined>(
    Number.isFinite(parsedIncomingRating) ? parsedIncomingRating : undefined
  );

  const hasRating = resolvedRating !== undefined && Number.isFinite(resolvedRating);

  useEffect(() => {
    let cancelled = false;

    if (Number.isFinite(parsedIncomingRating)) {
      setResolvedRating(parsedIncomingRating);
    }

    void resolvePlanetTerpProfessorMetaByName(safeName).then((meta) => {
      if (cancelled) return;
      setResolvedSlug(meta?.slug ?? slug);
      if (!Number.isFinite(parsedIncomingRating) && Number.isFinite(meta?.averageRating)) {
        setResolvedRating(meta?.averageRating);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [parsedIncomingRating, safeName, slug]);

  return (
    <a
      className={className ?? "cp-prof-link"}
      href={getPlanetTerpUrlForProfessor(safeName, resolvedSlug)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      onMouseDown={onMouseDown}
      aria-label={safeName}
    >
      <span>{safeName}</span>
      <span className={`cp-prof-stars ${hasRating ? "" : "is-muted"}`}>
        {formatRatingStars(hasRating ? resolvedRating : undefined)}
      </span>
      {hasRating && <span className="cp-prof-rating-value">{resolvedRating?.toFixed(1)}</span>}
      {!hasRating && <span className="cp-prof-rating-na">N/A</span>}
    </a>
  );
}
