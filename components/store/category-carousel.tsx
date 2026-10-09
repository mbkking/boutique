import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";

/**
 * Catégories de la page d'accueil.
 *
 * Sur mobile : une seule rangée horizontale scrollable avec accrochage
 * (scroll-snap), sans défilement automatique (retiré : l'utilisateur garde le
 * contrôle du geste).
 *
 * À partir de `sm` : la grille existante est conservée à l'identique.
 *
 * Les données proviennent de la page serveur, rien n'est rechargé.
 */

export interface CategoryCarouselItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  children: { id: string }[];
}

export function CategoryCarousel({
  categories,
}: {
  categories: CategoryCarouselItem[];
}) {
  const count = categories.length;

  if (count === 0) return null;

  return (
    <ul
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