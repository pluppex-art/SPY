/**
 * Repescagem pela Aurora (Configurações › CRM › SLA). A Aurora chama o cliente por um número só dela, que não conversa.
 * Gravado em app_settings na chave abaixo; quem chama o cliente e avisa o vendedor é a automação "Repescagem Aurora" no n8n, que lê exatamente estes campos
 * (regras em scripts/n8n/repescagem-aurora/regras.cjs).
 */
export const REPESCAGEM_KEY = "crm_repescagem_aurora";

export interface RepescagemAurora {
  ativo: boolean;
  /** horas sem resposta do cliente para a Aurora chamar */
  horas: number;
  inicio: string;
  fim: string;
  /** 1 = segunda ... 7 = domingo */
  dias: number[];
  /** máximo de clientes chamados por dia (um número só envia) */
  limiteDia: number;
  /** não chama o mesmo cliente de novo antes deste prazo */
  intervaloDias: number;
  /** vazio = mensagem padrão */
  mensagem: string;
  /** com o modo de teste ligado, só o número de teste é chamado e avisado */
  modoTeste: boolean;
  numeroTeste: string;
  /** conversas que pararam antes desta data nunca são chamadas (evita disparo em massa ao ligar) */
  ativadoEm: string;
}

export const MENSAGEM_REPESCAGEM = "Oi, {cliente}! Aqui é a Aurora, assistente de {vendedor}. Nossa conversa ficou parada: ainda posso te ajudar? Responda aqui e {vendedor} chama você pelo WhatsApp de sempre.";
export const COMO_SAIR = "Para não receber mais este tipo de mensagem, responda SAIR.";

/** Nome da sessão do número da Aurora desta empresa (a automação usa a mesma conta). */
export const numeroDaAurora = (tenantId: string) => "aurora-repescagem-" + tenantId.replace(/-/g, "").slice(0, 12);

export const REPESCAGEM_PADRAO: RepescagemAurora = {
  ativo: false, horas: 48, inicio: "09:00", fim: "18:00", dias: [1, 2, 3, 4, 5, 6],
  limiteDia: 10, intervaloDias: 30, mensagem: "", modoTeste: true, numeroTeste: "", ativadoEm: "",
};

/** Mensagem do que falta para poder salvar, ou null quando está tudo certo. */
export function erroRepescagem(c: RepescagemAurora): string | null {
  if (!c.ativo) return null;
  if (!(c.horas >= 1)) return "Informe depois de quantas horas sem resposta a Aurora deve chamar o cliente.";
  if (!(c.limiteDia >= 1 && c.limiteDia <= 30)) return "O limite por dia em cada número vai de 1 a 30.";
  if (!(c.intervaloDias >= 7)) return "Espere ao menos 7 dias para chamar o mesmo cliente de novo.";
  if (!c.dias.length) return "Marque ao menos um dia de envio.";
  if (!c.inicio || !c.fim || c.inicio >= c.fim) return "O fim do horário de envio precisa ser depois do início.";
  if (c.modoTeste && c.numeroTeste.replace(/\D/g, "").length < 10) return "No modo de teste, informe o número com DDD que vai fazer o papel de cliente.";
  return null;
}

/** Marca o momento a partir do qual as conversas contam, sempre que a repescagem passa a alcançar clientes. */
export function prepararRepescagem(novo: RepescagemAurora, anterior: RepescagemAurora | undefined, agora = new Date()): RepescagemAurora {
  const ampliou = novo.ativo && (!anterior?.ativo || (anterior.modoTeste && !novo.modoTeste));
  return { ...novo, ativadoEm: ampliou ? agora.toISOString() : (anterior?.ativadoEm ?? novo.ativadoEm) };
}
