/** Avisos simples antes de criar a campanha de e-mail: coisas que costumam derrubar a entrega (spam) ou o resultado. */
export interface AvisoEmail { nivel: "atencao" | "dica"; texto: string }

const PALAVRAS_SPAM = ["grátis", "gratis", "100% garantido", "ganhe dinheiro", "clique aqui agora", "urgente!!!", "sem compromisso", "dinheiro fácil", "dinheiro facil", "promoção imperdível", "promocao imperdivel"];

export function avisosDoEmail(assunto: string, corpo: string): AvisoEmail[] {
  const out: AvisoEmail[] = [];
  // O endereço de uma imagem não conta como link da mensagem.
  const a = assunto.trim(), c = corpo.replace(/!\[[^\]]*\]\([^)\s]*\)/g, " ").trim();
  if (a) {
    if (a.length > 70) out.push({ nivel: "dica", texto: `Assunto com ${a.length} letras: acima de ~70 ele é cortado no celular.` });
    const letras = a.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letras.length >= 8 && letras === letras.toUpperCase()) out.push({ nivel: "atencao", texto: "Assunto todo em MAIÚSCULAS costuma ir para o spam." });
    if (/[!?]{2,}/.test(a) || (a.match(/!/g) || []).length > 1) out.push({ nivel: "atencao", texto: "Muitas exclamações/interrogações no assunto aumentam a chance de spam." });
  }
  const todo = `${a} ${c}`.toLowerCase();
  const achadas = PALAVRAS_SPAM.filter((p) => todo.includes(p));
  if (achadas.length) out.push({ nivel: "atencao", texto: `Expressões que filtros de spam não gostam: ${achadas.slice(0, 3).join(", ")}.` });
  if (c) {
    const links = (c.match(/https?:\/\/\S+/gi) || []).length;
    if (links === 0) out.push({ nivel: "dica", texto: "Nenhum link na mensagem: sem link não dá para medir cliques." });
    if (links > 5) out.push({ nivel: "atencao", texto: `${links} links na mensagem: e-mails com muitos links caem mais no spam.` });
    if (c.length < 40) out.push({ nivel: "dica", texto: "Mensagem muito curta: textos de uma linha costumam parecer spam." });
    if (!/\{\{\s*(primeiro[_ ]nome|nome)\s*\}\}/i.test(`${a} ${c}`)) out.push({ nivel: "dica", texto: "Usar {{primeiro_nome}} deixa o e-mail mais pessoal e melhora a abertura." });
  }
  return out;
}
