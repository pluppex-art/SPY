/** Campos de um formulário hospedado no sistema. Usados pela tela pública, pelo editor e pela validação do servidor. */
export type TipoCampo = "texto" | "longo" | "email" | "telefone" | "numero" | "opcoes";
export interface CampoForm { id: string; label: string; tipo: TipoCampo; obrigatorio: boolean; opcoes?: string[] }

export const CAMPOS_PADRAO: CampoForm[] = [
  { id: "nome", label: "Seu nome", tipo: "texto", obrigatorio: true },
  { id: "telefone", label: "WhatsApp", tipo: "telefone", obrigatorio: true },
  { id: "email", label: "E-mail", tipo: "email", obrigatorio: false },
  { id: "mensagem", label: "Como podemos ajudar?", tipo: "longo", obrigatorio: false },
];

export const TIPOS_CAMPO: { id: TipoCampo; nome: string }[] = [
  { id: "texto", nome: "Texto curto" }, { id: "longo", nome: "Texto longo" }, { id: "email", nome: "E-mail" },
  { id: "telefone", nome: "Telefone/WhatsApp" }, { id: "numero", nome: "Número" }, { id: "opcoes", nome: "Escolha uma opção" },
];

const TIPOS = new Set<string>(TIPOS_CAMPO.map((t) => t.id));

/** Lê o que veio do banco/editor: mantém só campos válidos, com ids únicos e limites de tamanho. */
export function normalizarCampos(raw: unknown): CampoForm[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: CampoForm[] = [];
  for (const c of raw.slice(0, 30)) {
    const label = String((c as any)?.label ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
    const tipo = String((c as any)?.tipo ?? "");
    let id = String((c as any)?.id ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
    if (!label || !TIPOS.has(tipo)) continue;
    if (!id) id = `campo_${out.length + 1}`;
    while (vistos.has(id)) id = `${id}_2`;
    vistos.add(id);
    const opcoes = tipo === "opcoes" ? Array.from(new Set(((c as any)?.opcoes ?? []).map((o: unknown) => String(o).trim().slice(0, 80)).filter(Boolean))).slice(0, 20) as string[] : undefined;
    if (tipo === "opcoes" && (!opcoes || opcoes.length < 2)) continue;
    out.push({ id, label, tipo: tipo as TipoCampo, obrigatorio: (c as any)?.obrigatorio === true, ...(opcoes ? { opcoes } : {}) });
  }
  return out;
}

export type ResultadoRespostas = { ok: true; contato: { nome: string; email: string; telefone: string }; nota: string } | { ok: false; erro: string };

/** Confere as respostas do visitante contra os campos do formulário e monta contato + nota do lead. */
/** Telefone brasileiro: 10 ou 11 dígitos (DDD + número) ou 12/13 começando por 55. */
export const telefoneBrValido = (d: string) => (d.length === 10 || d.length === 11) || ((d.length === 12 || d.length === 13) && d.startsWith("55"));

export function validarRespostas(campos: CampoForm[], corpo: Record<string, unknown>): ResultadoRespostas {
  const limpar = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  const contato = { nome: "", email: "", telefone: "" };
  const linhas: string[] = [];
  for (const c of campos) {
    const bruto = corpo[c.id];
    const v = limpar(bruto, c.tipo === "longo" ? 2000 : 300);
    if (!v) { if (c.obrigatorio) return { ok: false, erro: `Preencha: ${c.label}.` }; continue; }
    if (c.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, erro: `E-mail inválido em "${c.label}".` };
    if (c.tipo === "telefone") { const d = v.replace(/\D/g, ""); if (!telefoneBrValido(d)) return { ok: false, erro: `Telefone inválido em "${c.label}".` }; }
    if (c.tipo === "numero" && !Number.isFinite(Number(v.replace(",", ".")))) return { ok: false, erro: `Informe um número em "${c.label}".` };
    if (c.tipo === "opcoes" && !(c.opcoes ?? []).includes(v)) return { ok: false, erro: `Escolha uma das opções em "${c.label}".` };
    if (c.id === "nome" || (!contato.nome && c.tipo === "texto" && /nome/i.test(c.label))) contato.nome = v;
    else if (c.tipo === "email" && !contato.email) contato.email = v.toLowerCase();
    else if (c.tipo === "telefone" && !contato.telefone) contato.telefone = v.replace(/\D/g, "");
    else linhas.push(`${c.label}: ${v}`);
  }
  if (contato.nome.length < 2) return { ok: false, erro: "Informe seu nome." };
  if (!contato.email && !contato.telefone) return { ok: false, erro: "Informe seu WhatsApp ou e-mail." };
  return { ok: true, contato, nota: linhas.join("\n").slice(0, 3000) };
}

/** Problema que impede salvar os campos (ou null se estiver tudo certo): título, opções, nome e algum contato. */
export function erroDosCampos(campos: CampoForm[]): string | null {
  const limpos = normalizarCampos(campos.map((c) => ({ ...c, opcoes: c.tipo === "opcoes" ? c.opcoes : undefined })));
  if (limpos.length !== campos.length) return "Revise as perguntas: todas precisam de título, e “Escolha uma opção” precisa de pelo menos 2 opções.";
  if (!limpos.some((c) => c.tipo === "telefone" || c.tipo === "email")) return "Inclua um campo de WhatsApp/telefone ou de e-mail, senão o lead chega sem contato.";
  if (!limpos.some((c) => c.id === "nome" || (c.tipo === "texto" && /nome/i.test(c.label)))) return "Inclua um campo de nome (com a palavra “nome” no título).";
  return null;
}
