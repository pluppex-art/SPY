/** Arquivos que o Chat envia pelo WhatsApp: preparo no navegador (compressão de foto, base64, gravação de áudio). */

export type TipoMidia = "image" | "audio" | "video" | "document";

export interface MidiaParaEnviar {
  kind: TipoMidia;
  blob: Blob;
  mimetype: string;
  filename: string;
  /** Endereço local para mostrar a prévia (imagem). Precisa ser liberado com URL.revokeObjectURL. */
  previewUrl?: string;
}

/** Mesmo limite do servidor (server/chatMediaSaida.ts). */
export const LIMITE_BYTES = 3 * 1024 * 1024;
const LADO_MAX = 1600;

export const formatarTamanho = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const tipoDoArquivo = (mime: string): TipoMidia | null => {
  const m = mime.split(";")[0].toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/.test(m)) return "image";
  if (/^audio\//.test(m)) return "audio";
  if (/^video\/(mp4|webm|quicktime)$/.test(m)) return "video";
  if (/^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-(excel|powerpoint)|text\/plain|text\/csv|application\/zip)/.test(m)) return "document";
  return null;
};

/** Reduz a foto (lado maior 1600 px, JPEG) para caber no limite e enviar rápido. GIFs ficam como estão. */
async function comprimirImagem(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const comprimida = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
  return comprimida && comprimida.size < file.size ? comprimida : file;
}

/** Valida e prepara um arquivo escolhido pelo usuário. Devolve o erro em português quando não dá para enviar. */
export async function prepararArquivo(file: File, forcar?: TipoMidia): Promise<{ ok: true; midia: MidiaParaEnviar } | { ok: false; erro: string }> {
  const kind = forcar === "image" ? (tipoDoArquivo(file.type) === "image" ? "image" : null) : tipoDoArquivo(file.type);
  if (!kind) return { ok: false, erro: "Esse tipo de arquivo não pode ser enviado. Use imagem, PDF, documento do Office, texto, CSV ou ZIP." };
  const blob = kind === "image" ? await comprimirImagem(file) : file;
  if (blob.size > LIMITE_BYTES) return { ok: false, erro: `O arquivo tem ${formatarTamanho(blob.size)}. O máximo é ${formatarTamanho(LIMITE_BYTES)}.` };
  const mimetype = blob.type || file.type;
  const nome = blob === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { ok: true, midia: { kind, blob, mimetype, filename: nome, previewUrl: kind === "image" ? URL.createObjectURL(blob) : undefined } };
}

/** Base64 puro (sem o prefixo "data:...;base64,"). */
export const blobParaBase64 = (blob: Blob) =>
  new Promise<string>((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(blob);
  });

/** Formato de gravação que este navegador sabe fazer (o WhatsApp prefere ogg/opus). */
export const formatoDeGravacao = (): string | undefined =>
  typeof MediaRecorder === "undefined"
    ? undefined
    : ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));

export const gravacaoDisponivel = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export const formatarDuracao = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
