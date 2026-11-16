/**
 * Envio de mídia (imagem, áudio, vídeo, documento) pelo Chat: valida o que o navegador mandou ANTES de
 * falar com o WhatsApp. Função pura, sem rede — testada em tests/chatbot/chat-media-saida.test.ts.
 *
 * Limite de 3 MB por arquivo: o corpo da requisição (base64) precisa caber nos ~4,5 MB que a
 * plataforma de hospedagem aceita. Só tipos conhecidos passam (nada de executável).
 */
export type TipoMidia = "image" | "audio" | "video" | "document";

export const LIMITE_BYTES = 3 * 1024 * 1024;
export const LIMITE_LEGENDA = 1000;

const TIPOS: Record<TipoMidia, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif)$/,
  audio: /^audio\/(ogg|webm|mpeg|mp3|mp4|aac|wav|x-m4a|m4a|opus)$/,
  video: /^video\/(mp4|webm|quicktime)$/,
  document: /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.ms-(excel|powerpoint)|text\/plain|text\/csv|application\/zip)$/,
};

export interface MidiaSaida {
  kind: TipoMidia;
  mimetype: string;
  filename: string;
  /** Base64 puro (sem o prefixo "data:...;base64,"). */
  data: string;
  caption: string;
  bytes: number;
}

export type ResultadoMidia = { ok: true; midia: MidiaSaida } | { ok: false; erro: string };

/** Mimetype sem parâmetros: "audio/ogg; codecs=opus" → "audio/ogg". */
const baseMime = (m: unknown) => String(m ?? "").split(";")[0].trim().toLowerCase();

/** Nome seguro: só o último trecho, sem caracteres de controle nem barras, no máximo 120 caracteres. */
export function nomeSeguro(nome: unknown, padrao: string): string {
  const limpo = String(nome ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()!
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return limpo || padrao;
}

export function validarMidiaSaida(body: any): ResultadoMidia {
  const kind = String(body?.kind ?? "") as TipoMidia;
  if (!(kind in TIPOS)) return { ok: false, erro: "Tipo de mídia inválido." };

  const mimeCompleto = String(body?.mimetype ?? "").trim();
  const mime = baseMime(mimeCompleto);
  if (!TIPOS[kind].test(mime)) return { ok: false, erro: `Tipo de arquivo não permitido (${mime || "desconhecido"}).` };

  const data = String(body?.data ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, erro: "Arquivo inválido." };
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes <= 0) return { ok: false, erro: "Arquivo vazio." };
  if (bytes > LIMITE_BYTES) return { ok: false, erro: `Arquivo grande demais (máximo ${LIMITE_BYTES / 1024 / 1024} MB).` };

  const caption = String(body?.caption ?? "").trim().slice(0, LIMITE_LEGENDA);
  const extPadrao = { image: "imagem", audio: "audio", video: "video", document: "arquivo" }[kind];
  return { ok: true, midia: { kind, mimetype: mimeCompleto || mime, filename: nomeSeguro(body?.filename, extPadrao), data, caption, bytes } };
}

/** Texto que fica no histórico da conversa (o arquivo em si vive no WhatsApp). */
export function rotuloHistorico(m: Pick<MidiaSaida, "kind" | "filename" | "caption">): string {
  const base = { image: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: `📎 ${m.filename}` }[m.kind];
  return m.caption ? `${base}\n${m.caption}` : base;
}
