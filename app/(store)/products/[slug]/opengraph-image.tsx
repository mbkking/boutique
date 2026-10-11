import { ImageResponse } from "next/og";
import { getProductBySlug } from "@/lib/data/products";
import { getSiteName, getBranding } from "@/lib/data/site";
import { formatPrice } from "@/lib/services/pricing";

/**
 * Image Open Graph générée pour chaque produit.
 *
 * C'est ce visuel que Facebook, WhatsApp, Telegram… affichent dans l'aperçu
 * d'un lien partagé : le client y voit la photo, le nom, le prix et la marque,
 * et le lien reste cliquable vers la fiche du produit.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aperçu du produit";

const FALLBACK_BRAND = "#0f766e";
const FALLBACK_BRAND_DARK = "#115e59";

/**
 * Charge la photo produit et la renvoie en `data:` URL.
 *
 * Passer par une data URL évite au moteur de rendu d'aller chercher l'image
 * (et donc tout problème de CORS au moment de la composition). Un échec n'est
 * jamais bloquant : on compose alors la carte sans photo.
 */
async function loadImageDataUrl(
  url: string | null | undefined
): Promise<string | null> {
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, siteName, branding] = await Promise.all([
    getProductBySlug(slug),
    getSiteName(),
    getBranding(),
  ]);

  const name = product?.name ?? siteName;
  const priceLabel = product ? formatPrice(product.price) : null;
  const compareAt =
    product && product.compare_at_price && product.compare_at_price > product.price
      ? formatPrice(product.compare_at_price)
      : null;
  const imageData = await loadImageDataUrl(product?.images[0]?.url);
  const brand = branding.brand_primary || FALLBACK_BRAND;
  const brandDark = branding.brand_secondary || FALLBACK_BRAND_DARK;
  const tagline = branding.site_tagline || "Paiement à la livraison à Niamey";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${brand} 0%, ${brandDark} 100%)`,
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: brand,
                fontSize: 32,
                fontWeight: 800,
              }}
            >
              {siteName.charAt(0)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {siteName}
            </div>
          </div>
          <div
            style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.85)" }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            marginTop: 28,
            background: "#ffffff",
            borderRadius: 28,
            padding: 32,
            gap: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 420,
              height: 460,
              borderRadius: 20,
              overflow: "hidden",
              background: "#f3f4f6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {imageData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageData}
                alt=""
                width={420}
                height={460}
                style={{ width: 420, height: 460, objectFit: "contain" }}
              />
            ) : (
              <div style={{ display: "flex", fontSize: 26, color: "#9ca3af" }}>
                {siteName}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", fontSize: 26, color: brand, fontWeight: 700 }}>
              Produit
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 52,
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.1,
              }}
            >
              {name.length > 60 ? `${name.slice(0, 57)}…` : name}
            </div>
            {priceLabel ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 60,
                    fontWeight: 800,
                    color: brand,
                  }}
                >
                  {priceLabel}
                </div>
                {compareAt ? (
                  <div
                    style={{
                      display: "flex",
                      fontSize: 30,
                      color: "#9ca3af",
                      textDecoration: "line-through",
                    }}
                  >
                    {compareAt}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
