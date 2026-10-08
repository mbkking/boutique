import { redirect } from "next/navigation";

/**
 * L'index /products n'a jamais existé : le catalogue se parcourt par
 * catégorie (ou via /search). On redirige pour éviter la 404.
 */
export default function ProductsIndexPage() {
  redirect("/categories");
}
