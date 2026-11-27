/**
 * Imagem para usar dentro de um e-mail: reduzida no navegador e publicada na pasta da empresa no depósito público de
 * produtos (e-mail só mostra imagem com endereço na internet).
 */
import { supabase } from "./supabase";

const LARGURA_MAX = 1200; // o dobro dos 600 px do e-mail, para tela de celular nítida
const PESO_MAX = 1_500_000;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

const paraArquivo = (tela: HTMLCanvasElement, tipo: string, qualidade?: number) =>
  new Promise<Blob>((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error("Não foi possível preparar a imagem."))), tipo, qualidade));

async function preparar(arquivo: File): Promise<{ dados: Blob; extensao: "png" | "jpg" }> {
  if (!TIPOS.includes(arquivo.type)) throw new Error("Envie uma imagem PNG, JPG ou WEBP.");
  if (arquivo.size > 15_000_000) throw new Error("Imagem grande demais (máximo de 15 MB).");
  const foto = await createImageBitmap(arquivo).catch(() => { throw new Error("Não consegui abrir essa imagem."); });
  const escala = Math.min(1, LARGURA_MAX / foto.width);
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(foto.width * escala));
  tela.height = Math.max(1, Math.round(foto.height * escala));
  const desenho = tela.getContext("2d")!;
  desenho.drawImage(foto, 0, 0, tela.width, tela.height);
  // PNG mantém o fundo transparente; se ficar pesado (ou for foto), vai como JPG com fundo branco.
  if (arquivo.type === "image/png") {
    const png = await paraArquivo(tela, "image/png");
    if (png.size <= PESO_MAX) return { dados: png, extensao: "png" };
  }
  desenho.globalCompositeOperation = "destination-over";
  desenho.fillStyle = "#ffffff";
  desenho.fillRect(0, 0, tela.width, tela.height);
  return { dados: await paraArquivo(tela, "image/jpeg", 0.85), extensao: "jpg" };
}

export async function enviarImagemDeEmail(tenantId: string, arquivo: File): Promise<string> {
  if (!supabase || !tenantId) throw new Error("Empresa não identificada.");
  const { dados, extensao } = await preparar(arquivo);
  const caminho = `${tenantId}/email/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from("products").upload(caminho, dados, { upsert: false, contentType: extensao === "png" ? "image/png" : "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(/row-level security|unauthorized|403/i.test(error.message) ? "Sua conta não pode enviar imagens para esta empresa." : `Não foi possível enviar a imagem: ${error.message}`);
  return supabase.storage.from("products").getPublicUrl(caminho).data.publicUrl;
}
