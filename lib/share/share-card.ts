/**
 * Génération côté navigateur d'une carte de partage produit.
 *
 * Le but : lorsqu'un client partage un produit, envoyer une image soignée
 * (logo, photo, nom, prix, lien) au lieu d'un simple texte. La carte est
 * dessinée dans un `<canvas>` puis exportée en PNG.
 *
 * Aucune dépendance externe : le dessin se fait avec l'API Canvas. Les images
 * distantes (photo produit sur Supabase) sont chargées en `crossorigin` ; si le
 * navigateur refuse l'accès (CORS), on dessine la carte sans la photo plutôt que
 * d'échouer — un partage sans image reste préférable à pas de partage du tout.
 */

export interface ProductShareCardInput {
  productName: string;
  price: number;
  imageUrl: string | null;
  logoUrl?: string;
  siteName?: string;
  url: string;
  /** Prix barré éventuel (promotion). */
  compareAtPrice?: number | null;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const BRAND = "#0f766e";
const BRAND_DARK = "#115e59";
const INK = "#1f2937";
const MUTED = "#6b7280";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const ratio = Math.min(w / image.width, h / image.height);
  const drawW = image.width * ratio;
  const drawH = image.height * ratio;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const ratio = Math.max(w / image.width, h / image.height);
  const drawW = image.width * ratio;
  const drawH = image.height * ratio;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines) {
    // Tronque proprement la dernière ligne si le texte débordait encore.
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }

  return lines;
}

function formatXof(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;
}

/**
 * Dessine la carte et renvoie un PNG. `null` si le navigateur n'a pas de
 * contexte Canvas (cas dégénéré) — l'appelant retombe alors sur le partage
 * texte classique.
 */
export async function renderProductShareCard(
  input: ProductShareCardInput
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const siteName = input.siteName?.trim() || "ISF NAF-CHOPOP";

  // Fond dégradé de marque.
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, BRAND);
  background.addColorStop(1, BRAND_DARK);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Carte blanche centrale.
  const margin = 70;
  const cardX = margin;
  const cardY = 150;
  const cardW = WIDTH - margin * 2;
  const cardH = HEIGHT - cardY - 150;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fill();

  // Logo + nom de l'application en haut.
  const [logoImage] = await Promise.all([
    loadImage(input.logoUrl || "/images/logo.jpeg"),
  ]);

  const logoSize = 140;
  const logoX = WIDTH / 2 - logoSize / 2;
  const logoY = 60;
  ctx.save();
  roundRect(ctx, logoX, logoY, logoSize, logoSize, 36);
  ctx.clip();
  if (logoImage) {
    drawCover(ctx, logoImage, logoX, logoY, logoSize, logoSize);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.fillStyle = BRAND;
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(siteName.charAt(0), WIDTH / 2, logoY + logoSize / 2);
  }
  ctx.restore();

  // Image produit.
  const pad = 56;
  const imageBoxX = cardX + pad;
  const imageBoxY = cardY + pad;
  const imageBoxW = cardW - pad * 2;
  const imageBoxH = 720;
  ctx.save();
  roundRect(ctx, imageBoxX, imageBoxY, imageBoxW, imageBoxH, 32);
  ctx.clip();
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(imageBoxX, imageBoxY, imageBoxW, imageBoxH);

  const productImage = input.imageUrl ? await loadImage(input.imageUrl) : null;
  if (productImage) {
    drawContain(ctx, productImage, imageBoxX, imageBoxY, imageBoxW, imageBoxH);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(siteName, imageBoxX + imageBoxW / 2, imageBoxY + imageBoxH / 2);
  }
  ctx.restore();

  // Nom du produit.
  let cursorY = imageBoxY + imageBoxH + 96;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "bold 58px system-ui, sans-serif";
  const nameLines = wrapText(ctx, input.productName, cardW - pad * 2, 2);
  for (const line of nameLines) {
    ctx.fillText(line, cardX + pad, cursorY);
    cursorY += 68;
  }

  // Prix.
  cursorY += 12;
  ctx.fillStyle = BRAND;
  ctx.font = "bold 82px system-ui, sans-serif";
  ctx.fillText(formatXof(input.price), cardX + pad, cursorY);

  if (input.compareAtPrice && input.compareAtPrice > input.price) {
    const priceWidth = ctx.measureText(formatXof(input.price)).width;
    ctx.fillStyle = MUTED;
    ctx.font = "40px system-ui, sans-serif";
    const oldText = formatXof(input.compareAtPrice);
    const oldX = cardX + pad + priceWidth + 28;
    ctx.fillText(oldText, oldX, cursorY);
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 3;
    const oldWidth = ctx.measureText(oldText).width;
    ctx.beginPath();
    ctx.moveTo(oldX, cursorY - 14);
    ctx.lineTo(oldX + oldWidth, cursorY - 14);
    ctx.stroke();
  }

  // Ligne de réassurance puis le lien, en bas de carte.
  cursorY += 64;
  ctx.fillStyle = MUTED;
  ctx.font = "36px system-ui, sans-serif";
  ctx.fillText("Paiement à la livraison", cardX + pad, cursorY);

  ctx.fillStyle = BRAND_DARK;
  ctx.font = "bold 34px system-ui, sans-serif";
  const link = input.url.replace(/^https?:\/\//, "");
  const linkLines = wrapText(ctx, link, cardW - pad * 2, 1);
  ctx.fillText(linkLines[0] ?? link, cardX + pad, cardY + cardH - 40);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
    } catch {
      // Canvas « souillé » par une image CORS : on renonce à l'image.
      resolve(null);
    }
  });
}
