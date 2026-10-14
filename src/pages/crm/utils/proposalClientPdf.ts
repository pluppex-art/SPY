import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  PropostaDocumento,
  type PropostaDocumentoData,
  type PropostaDocumentoItem,
  type PropostaDocumentoEmpresa,
} from "../../../components/proposta/PropostaDocumento";
import { handleDownloadPdf } from "./proposalPdf";

/* ────────────────────────────────────────────────────────────────────────────
 * PDF = "print" do modo cliente. Monta o MESMO <PropostaDocumento> que o cliente vê
 * em /proposta/:token (somente leitura) num container fora da tela, com os tokens de
 * tema CLAROS forçados, captura com html-to-image e fatia em páginas A4 com jsPDF.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PropostaClienteBranding {
  brandColor: string;
  tenantName: string;
  empresaDados?: PropostaDocumentoEmpresa | null;
  logoUrl?: string;
}

export type PropostaClienteDados = Omit<PropostaDocumentoData, "itens"> & { id?: string | null };

/** Item recorrente = valor do ciclo ×1; pontual = qtd × unitário (mesma regra do documento). */
export function somaItensDocumento(itens: PropostaDocumentoItem[]): number {
  return itens.reduce((acc, i) => {
    const recorrente = !!i.billingType && i.billingType !== "one_time";
    return acc + (recorrente ? i.precoUnitario : i.precoUnitario * i.quantidade);
  }, 0);
}

/** Linha de `proposals` + linhas de `proposal_items` → dados do documento do cliente. */
export function propostaParaDocumento(
  row: any,
  itemRows: any[],
  fallbackVendedor?: string | null
): { data: PropostaClienteDados; itens: PropostaDocumentoItem[] } {
  const itens: PropostaDocumentoItem[] = (itemRows || []).map((i) => ({
    productName: i.product_name,
    quantidade: Number(i.quantidade) || 0,
    precoUnitario: Number(i.preco_unitario) || 0,
    billingType: i.billing_type ?? null,
  }));
  const valor = Number(row?.valor) > 0 ? Number(row.valor) : somaItensDocumento(itens);
  return {
    itens,
    data: {
      id: row?.id ?? null,
      titulo: row?.titulo || "Proposta Comercial",
      cliente: row?.cliente ?? null,
      valor,
      status: row?.status ?? null,
      validade: row?.validade ?? null,
      conteudoTexto: row?.conteudo_texto ?? null,
      criadaEm: row?.created_at || new Date().toISOString(),
      vendedor: row?.vendedor || fallbackVendedor || null,
      decisorNome: row?.decisor_nome ?? null,
      decisorCargo: row?.decisor_cargo ?? null,
    },
  };
}

const LIGHT_TOKENS: Record<string, string> = {
  "--color-surface": "#F8FAFC",
  "--color-surface-elevated": "#FFFFFF",
  "--color-surface-sunken": "#F1F5F9",
  "--color-border-default": "#E2E8F0",
  "--color-border-subtle": "#F1F5F9",
  "--color-text-primary": "#0F172A",
  "--color-text-muted": "#64748B",
  "--color-text-faint": "#94A3B8",
  "--shadow-panel": "none",
};

const slug = (s: string) =>
  (s || "cliente")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function waitForAssets(root: HTMLElement) {
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* ignore */
  }
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
            setTimeout(res, 8000);
          })
    )
  );
  await nextFrame();
  await nextFrame();
}

/**
 * Posições (px, relativas ao topo do container) onde é seguro quebrar a página:
 * topo de cada linha de tabela, de cada bloco direto e de cada linha de texto das cláusulas.
 */
function collectBreakpoints(container: HTMLElement): number[] {
  const top0 = container.getBoundingClientRect().top;
  const pts = new Set<number>();
  const add = (y: number) => pts.add(Math.round(y - top0));
  container.querySelectorAll("tbody tr, tfoot tr").forEach((el) => add(el.getBoundingClientRect().top));
  // blocos de seção do documento (filhos do Card e dos wrappers de seção)
  const card = container.firstElementChild as HTMLElement | null;
  if (card) {
    Array.from(card.children).forEach((c) => {
      const el = c as HTMLElement;
      if (getComputedStyle(el).position === "absolute") return;
      add(el.getBoundingClientRect().top);
      Array.from(el.children).forEach((cc) => add((cc as HTMLElement).getBoundingClientRect().top));
    });
  }
  // texto longo (cláusulas): uma linha = ponto de quebra
  container.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.whiteSpace !== "pre-wrap") return;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const r = el.getBoundingClientRect();
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBot = parseFloat(cs.paddingBottom) || 0;
    const inner = r.height - padTop - padBot;
    const lines = Math.round(inner / lh);
    for (let k = 1; k < lines; k++) add(r.top + padTop + k * lh);
  });
  return Array.from(pts).sort((a, b) => a - b);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Falha ao carregar a captura"));
    img.src = src;
  });
}

export async function downloadPropostaClientePdf(
  data: PropostaClienteDados,
  itens: PropostaDocumentoItem[],
  branding: PropostaClienteBranding
): Promise<boolean> {
  const toastId = toast.loading("Gerando PDF da proposta...");
  const WIDTH = 900;
  const host = document.createElement("div");
  host.setAttribute("data-proposta-pdf", "");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${WIDTH}px;background:#fff;color:#0F172A;color-scheme:light;pointer-events:none;`;
  Object.entries(LIGHT_TOKENS).forEach(([k, v]) => host.style.setProperty(k, v));
  const style = document.createElement("style");
  style.textContent = `[data-proposta-pdf] *{animation:none!important;transition:none!important}[data-proposta-pdf] .shadow-xl,[data-proposta-pdf] .shadow-xs{box-shadow:none!important}`;
  host.appendChild(style);
  const mount = document.createElement("div");
  mount.style.background = "#fff";
  host.appendChild(mount);
  document.body.appendChild(host);
  const root = createRoot(mount);

  try {
    const refId = `PROP-${(data.id || "").slice(0, 8) || "NOVA"}`;
    flushSync(() => {
      root.render(
        createElement(PropostaDocumento, {
          proposta: { ...data, itens },
          brandColor: branding.brandColor,
          tenantName: branding.tenantName,
          empresaDados: branding.empresaDados,
          isAccepted: data.status === "Aceita",
          isVencida: false,
          refId,
          acceptSlot: createElement(
            "span",
            { style: { fontSize: 11, color: "#64748B", fontStyle: "italic" } },
            "Aceite digital disponível no link da proposta."
          ),
        })
      );
    });
    await waitForAssets(mount);

    const totalH = Math.ceil(mount.scrollHeight);
    const breaks = collectBreakpoints(mount);
    const png = await toPng(mount, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: WIDTH,
      height: totalH,
      cacheBust: false,
    });
    const img = await loadImage(png);
    const scale = img.naturalWidth / WIDTH; // px da imagem por px CSS

    // A4 em mm; margens de 8mm; rodapé reserva 6mm para o nº da página.
    const PW = 210, PH = 297, M = 8, FOOT = 6;
    const usableW = PW - 2 * M;
    const usableH = PH - 2 * M - FOOT;
    const pageCssH = (usableH / usableW) * WIDTH; // altura de uma página em px CSS

    const slices: Array<[number, number]> = [];
    let start = 0;
    while (start < totalH - 1) {
      let end = start + pageCssH;
      if (end >= totalH) {
        end = totalH;
      } else {
        // maior ponto seguro dentro da página (mínimo 35% da página para não deixar vazio grande)
        const min = start + pageCssH * 0.35;
        let best = -1;
        for (const b of breaks) if (b > min && b <= end) best = b;
        if (best > 0) end = best;
      }
      slices.push([start, end]);
      start = end;
    }

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const total = slices.length;
    for (let i = 0; i < total; i++) {
      const [y0, y1] = slices[i];
      if (i > 0) pdf.addPage();
      const canvas = document.createElement("canvas");
      const sy = Math.round(y0 * scale);
      const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round((y1 - y0) * scale)));
      canvas.width = img.naturalWidth;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, img.naturalWidth, sh);
      const hMm = (sh / img.naturalWidth) * usableW;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", M, M, usableW, hMm, undefined, "FAST");
      pdf.setFontSize(8);
      pdf.setTextColor(120, 130, 145);
      pdf.text(`${branding.tenantName} · ${refId}`, M, PH - 6);
      pdf.text(`Página ${i + 1} de ${total}`, PW - M, PH - 6, { align: "right" });
    }

    pdf.save(`Proposta-${slug(data.cliente || "")}-${refId.replace("PROP-", "")}.pdf`);
    toast.success("PDF da proposta gerado com sucesso!", { id: toastId });
    return true;
  } catch (err) {
    console.error("[proposalClientPdf] captura falhou, usando PDF simples", err);
    try {
      await handleDownloadPdf(
        {
          id: data.id || `prop-${Date.now()}`,
          cliente: data.cliente || "Cliente",
          titulo: data.titulo,
          valor: data.valor || 0,
          vendedor: data.vendedor || branding.tenantName,
          validade: data.validade || undefined,
          status: (data.status as any) || "Enviada",
          tipo: "texto",
          conteudo_texto: data.conteudoTexto,
        },
        itens.map((i) => ({ product_name: i.productName, quantidade: i.quantidade, preco_unitario: i.precoUnitario, billing_type: i.billingType ?? null } as any)),
        { logoUrl: branding.logoUrl, tenantName: branding.tenantName }
      );
      toast.warning("Não foi possível reproduzir o modo cliente; baixamos o PDF simples.", { id: toastId });
      return true;
    } catch {
      toast.error("Não foi possível gerar o PDF da proposta.", { id: toastId });
      return false;
    }
  } finally {
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  }
}
