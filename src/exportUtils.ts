// src/exportUtils.ts
import { TagStat } from "./types";
import { SearchSpendingResult } from "./types";

/**
 * Exporter les stats en CSV
 */
export function exportStatsToCSV(stats: TagStat[], transactions: SearchSpendingResult[]) {
  const csvRows = [];
  
  // En-têtes
  csvRows.push([
    "Tag ID",
    "Tag Nom",
    "Emoji",
    "Montant Total (€)",
    "Nombre de Transactions",
    "Pourcentage (%)",
    "Moyenne par Transaction (€)"
  ].join(","));
  
  // Données
  stats.forEach(stat => {
    const average = stat.count > 0 ? stat.totalAmount / stat.count : 0;
    csvRows.push([
      stat.tagId,
      `"${stat.tagName}"`,
      stat.emoji,
      stat.totalAmount.toFixed(2),
      stat.count,
      stat.percentage.toFixed(2),
      average.toFixed(2)
    ].join(","));
  });
  
  // Total
  const total = stats.reduce((sum, s) => sum + s.totalAmount, 0);
  csvRows.push([
    "",
    "TOTAL",
    "",
    total.toFixed(2),
    transactions.length,
    "100.00",
    ""
  ].join(","));
  
  // Créer le fichier
  const csvContent = csvRows.join("\n");
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  const date = new Date().toISOString().split('T')[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `tags_stats_${date}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exporter les transactions en CSV
 */
export function exportTransactionsToCSV(transactions: SearchSpendingResult[]) {
  const csvRows = [];
  
  // En-têtes
  csvRows.push([
    "Date",
    "Description",
    "Montant (€)",
    "Jar",
    "Compte",
    "Tags"
  ].join(","));
  
  // Données
  transactions.forEach(t => {
    csvRows.push([
      t.date,
      `"${t.description}"`,
      t.amount?.toFixed(2) || "0.00",
      t.jar,
      t.account,
      `"${t.tags || ''}"`
    ].join(","));
  });
  
  // Total
  const total = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  csvRows.push([
    "",
    "TOTAL",
    total.toFixed(2),
    "",
    "",
    ""
  ].join(","));
  
  // Créer le fichier
  const csvContent = csvRows.join("\n");
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  const date = new Date().toISOString().split('T')[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `transactions_${date}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exporter le graphique en PNG avec la légende
 */
export function exportChartToPNG(svgElement: SVGSVGElement, filename: string = "chart.png") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Impossible de créer le contexte canvas");
    return;
  }

  // Dimensions du SVG
  const svgRect = svgElement.getBoundingClientRect();
  const svgWidth = svgRect.width;
  const svgHeight = svgRect.height;

  // Chercher la légende
  const legendElement = document.getElementById('tag-legend');
  
  let totalHeight = svgHeight;
  let legendHeight = 0;
  
  if (legendElement) {
    const legendRect = legendElement.getBoundingClientRect();
    legendHeight = legendRect.height;
    totalHeight += legendHeight + 40; // 40px d'espacement
  }

  // Dimensions du canvas (x2 pour qualité)
  const scale = 2;
  canvas.width = Math.max(svgWidth, 800) * scale; // Augmenté à 800px pour éviter le rognage
  canvas.height = totalHeight * scale;

  // Fond blanc
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Convertir SVG en image
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const svgImg = new Image();
  
  svgImg.onload = () => {
    try {
      // Dessiner le SVG
      const svgX = (canvas.width - svgWidth * scale) / 2;
      ctx.drawImage(svgImg, svgX, 0, svgWidth * scale, svgHeight * scale);
      
      // Dessiner la légende si elle existe
      if (legendElement) {
        drawLegendSimple(ctx, legendElement, svgHeight * scale + 40);
      }
      
      // Télécharger
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error("Impossible de créer le blob");
          URL.revokeObjectURL(svgUrl);
          return;
        }
        
        const link = document.createElement("a");
        const downloadUrl = URL.createObjectURL(blob);
        
        const date = new Date().toISOString().split('T')[0];
        link.href = downloadUrl;
        link.download = `${filename}_${date}.png`;
        link.style.display = "none";
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(svgUrl);
        URL.revokeObjectURL(downloadUrl);
      });
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      URL.revokeObjectURL(svgUrl);
    }
  };
  
  svgImg.onerror = (error) => {
    console.error("Erreur de chargement de l'image SVG:", error);
    URL.revokeObjectURL(svgUrl);
  };
  
  svgImg.src = svgUrl;
}

/**
 * Dessiner la légende de manière simple
 */
function drawLegendSimple(ctx: CanvasRenderingContext2D, legendElement: HTMLElement, startY: number) {
  try {
    const items = legendElement.querySelectorAll('.tag-legend-item');
    if (!items || items.length === 0) return;

    const scale = 2;
    const cols = 3;
    const itemWidth = 450; // Augmenté pour éviter le rognage
    const itemHeight = 100;
    const startX = 80;

    items.forEach((item, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      const x = startX + col * itemWidth;
      const y = startY + row * itemHeight;

      try {
        // Récupérer les éléments
        const colorBox = item.querySelector('.tag-legend-color') as HTMLElement;
        const nameEl = item.querySelector('.tag-legend-name') as HTMLElement;
        const statsEl = item.querySelector('.tag-legend-stats') as HTMLElement;

        if (!colorBox || !nameEl || !statsEl) return;

        const color = getComputedStyle(colorBox).backgroundColor;
        const emoji = colorBox.textContent?.trim() || '';
        const name = nameEl.textContent?.trim() || '';
        const stats = statsEl.textContent?.trim() || '';

        // Dessiner le carré de couleur
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 80, 80);
        
        // Bordure
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 80, 80);

        // Emoji
        ctx.font = '48px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x + 40, y + 40);

        // Nom - Police système moderne
        ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = color;
        ctx.fillText(name, x + 100, y + 15);

        // Stats - Police système moderne
        ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        ctx.fillStyle = '#666666';
        ctx.fillText(stats, x + 100, y + 50);
      } catch (itemError) {
        console.error("Erreur sur un item de légende:", itemError);
      }
    });
  } catch (error) {
    console.error("Erreur lors du dessin de la légende:", error);
  }
}

/**
 * Export simple du SVG seulement (fallback)
 */
function exportSVGOnly(svgElement: SVGSVGElement, filename: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const svgRect = svgElement.getBoundingClientRect();
  canvas.width = svgRect.width * 2;
  canvas.height = svgRect.height * 2;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const link = document.createElement("a");
      const downloadUrl = URL.createObjectURL(blob);
      
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute("href", downloadUrl);
      link.setAttribute("download", `${filename}_${date}.png`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(downloadUrl);
    });
  };
  
  img.src = url;
}

/**
 * Dessiner la légende sur le canvas
 */
function drawLegendToCanvas(
  ctx: CanvasRenderingContext2D, 
  legendElement: HTMLElement, 
  x: number, 
  y: number,
  maxWidth: number
) {
  const items = legendElement.querySelectorAll('div[style*="display: flex"]');
  if (items.length === 0) return;

  const cols = 3;
  const itemWidth = maxWidth / cols;
  const itemHeight = 80;
  const padding = 20;

  items.forEach((item, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    
    const itemX = x + col * itemWidth + padding;
    const itemY = y + row * itemHeight + padding;

    // Récupérer les données
    const colorBox = item.querySelector('div[style*="background"]') as HTMLElement;
    const nameEl = item.querySelector('div[style*="fontWeight: 700"]') as HTMLElement;
    const statsEl = item.querySelector('div[style*="text-muted"]') as HTMLElement;

    if (!colorBox || !nameEl || !statsEl) return;

    const color = colorBox.style.background;
    const emoji = colorBox.textContent || '';
    const name = nameEl.textContent || '';
    const stats = statsEl.textContent || '';

    // Dessiner le carré de couleur
    ctx.fillStyle = color;
    ctx.fillRect(itemX, itemY, 60, 60);
    ctx.strokeStyle = '#E5E5EA';
    ctx.lineWidth = 2;
    ctx.strokeRect(itemX, itemY, 60, 60);

    // Dessiner l'emoji
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, itemX + 30, itemY + 30);

    // Dessiner le nom
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(name, itemX + 70, itemY + 10);

    // Dessiner les stats
    ctx.font = '18px Arial';
    ctx.fillStyle = '#666';
    ctx.fillText(stats, itemX + 70, itemY + 40);
  });
}
