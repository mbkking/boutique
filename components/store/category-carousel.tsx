"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";

/**
 * Catégories de la page d'accueil.
 *
 * Sur mobile : une seule rangée horizontale scrollable avec accrochage
 * (scroll-snap) et défilement automatique carte par carte.
 *
 * À partir de `sm` : la grille existante est conservée à l'identique.
 *
 * Le composant est client uniquement pour le défilement et l'autoplay ; les
 * données proviennent de la page serveur, rien n'est rechargé.
 */

export interface CategoryCarouselItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  children: { id: string }[];
}

/** Intervalle entre deux cartes en autoplay (ms). */
const AUTOPLAY_DELAY = 3500;

/** Après une interaction manuelle, l'autoplay reprend après ce délai (ms). */
const AUTOPLAY_RESUME_DELAY = 12000;

export function CategoryCarousel({
  categories,
}: {
  categories: CategoryCarouselItem[];
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);

  const count = categories.length;

  const cardAt = useCallback(
    (position: number) => trackRef.current?.children.item(position) as HTMLElement | null,
    []
  );

  const scrollToIndex = useCallback(
    (position: number, smooth: boolean) => {
      const card = cardAt(position);
      if (!card) return;

      card.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "nearest",
        inline: "start",
      });
    },
    [cardAt]
  );

  /**
   * Synchronise l'index courant avec la position réelle du défilement, pour
   * que l'autoplay reprenne toujours à la bonne place après un swipe manuel.
   */
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const first = track.children.item(0) as HTMLElement | null;
    if (!first) return;

    const travelled = track.scrollLeft - first.offsetLeft;
    const nearest = Math.round(travelled / (first.offsetWidth || 1));
    const clamped = Math.min(Math.max(nearest, 0), Math.max(count - 1, 0));
    indexRef.current = clamped;
  }, [count]);

  /** L'utilisateur interagit : on suspend l'autoplay puis on le reprend. */
  const pauseAutoplay = useCallback(() => {
    if (resumeRef.current) clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(() => {
      resumeRef.current = null;
    }, AUTOPLAY_RESUME_DELAY);
  }, []);

  useEffect(() => {
    if (count <= 1) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const tick = () => {
      // L'autoplay reste suspendu après un geste de l'utilisateur.
      if (resumeRef.current) return;

      // Le carrousel n'est visible que sur mobile ; on ne pilote donc le
      // défilement que s'il est réellement en mode horizontal.
      const track = trackRef.current;
      if (!track || track.scrollWidth <= track.clientWidth) {
        timerRef.current = setTimeout(tick, AUTOPLAY_DELAY);
        return;
      }

      const next = indexRef.current + 1 >= count ? 0 : indexRef.current + 1;
      indexRef.current = next;
      scrollToIndex(next, true);

      timerRef.current = setTimeout(tick, AUTOPLAY_DELAY);
    };

    timerRef.current = setTimeout(tick, AUTOPLAY_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [count, scrollToIndex]);

  useEffect(
    () => () => {
      if (resumeRef.current) clearTimeout(resumeRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (count === 0) return null;

  return (
    <ul
      ref={trackRef}
      onScroll={handleScroll}
      onTouchStart={pauseAutoplay}
      onMouseDown={pauseAutoplay}
      onFocusCapture={pauseAutoplay}
      onKeyDown={pauseAutoplay}
      aria-label="Catégories, faites défiler horizontalement"
      className={[
        "mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain",
        "pb-2 [scrollbar-width:none]",
        "sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:snap-none lg:grid-cols-4",
        "[&::-webkit-scrollbar]:hidden",
        count === 1 ? "sm:grid-cols-3" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {categories.map((category, index) => (
        <li
          key={category.id}
          data-aos="fade-up"
          data-aos-delay={index * 50}
          className="w-[85vw] max-w-[85%] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink"
        >
          <Link
            href={`/categories/${category.slug}`}
            tabIndex={0}
            className="focus-visible:focus-ring group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
          >
            <span className="relative block aspect-[4/3] overflow-hidden bg-surface-alt">
              {category.image_url ? (
                <Image
                  src={category.image_url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 85vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-full items-center justify-center bg-gradient-to-br from-primary-50 to-surface-warm text-primary/30"
                >
                  <Package className="size-10" />
                </span>
              )}
            </span>
            <span className="flex flex-1 flex-col gap-1 p-4">
              <span className="text-sm font-semibold text-text transition-colors group-hover:text-primary">
                {category.name}
              </span>
              {category.description ? (
                <span className="line-clamp-2 text-xs text-text-muted">
                  {category.description}
                </span>
              ) : null}
              {category.children.length > 0 ? (
                <span className="mt-1 text-xs font-medium text-primary">
                  {category.children.length} sous-catégorie
                  {category.children.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}