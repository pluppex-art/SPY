/**
 * SLA de resposta no WhatsApp (Configurações › CRM › SLA, "Cliente esperando resposta").
 * Gravado em app_settings na chave abaixo; quem envia os avisos e faz o rodízio é a automação
 * "SLA - Cliente Esperando Resposta" no n8n, que lê exatamente estes campos.
 */
export const SLA_RESPOSTA_KEY = "crm_sla_resposta";

export interface SlaResposta {
  ativo: boolean;
  /** minutos sem resposta (dentro do expediente) para o primeiro aviso */
  minutos: number;
  /** repete o aviso a cada N minutos; 0 = avisa uma vez só */
  repetirMinutos: number;
  maxAvisos: number;
  inicio: string;
  fim: string;
  /** 1 = segunda ... 7 = domingo */
  dias: number[];
  popup: boolean;
  whatsapp: boolean;
  /** só cobra resposta de quem está como lead em aberto no CRM */
  somenteLeads: boolean;
  /** com o modo de teste ligado, tudo vai só para o número de teste e nenhum lead muda de vendedor */
  modoTeste: boolean;
  numeroTeste: string;
  rodizio: boolean;
  rodizioHoras: number;
  /** esperas que começaram antes desta data são ignoradas (evita disparo em massa ao ligar) */
  ativadoEm: string;
}

export const SLA_RESPOSTA_PADRAO: SlaResposta = {
  ativo: false, minutos: 10, repetirMinutos: 30, maxAvisos: 3,
  inicio: "08:00", fim: "18:00", dias: [1, 2, 3, 4, 5, 6],
  popup: true, whatsapp: true, somenteLeads: true,
  modoTeste: true, numeroTeste: "",
  rodizio: false, rodizioHoras: 2, ativadoEm: "",
};

/** Mensagem do que falta para poder salvar, ou null quando está tudo certo. */
export function erroSlaResposta(c: SlaResposta): string | null {
  if (!c.ativo) return null;
  if (!(c.minutos >= 1)) return "Informe após quantos minutos o vendedor deve ser avisado.";
  if (!c.popup && !c.whatsapp) return "Escolha ao menos um tipo de aviso: pop-up no sistema ou WhatsApp.";
  if (!c.dias.length) return "Marque ao menos um dia de atendimento.";
  if (!c.inicio || !c.fim || c.inicio >= c.fim) return "O fim do expediente precisa ser depois do início.";
  if (c.modoTeste && c.numeroTeste.replace(/\D/g, "").length < 10) return "No modo de teste, informe o número com DDD que vai receber os avisos.";
  if (c.rodizio && c.rodizioHoras * 60 <= c.minutos) return "O rodízio precisa acontecer depois do primeiro aviso.";
  return null;
}

/** Marca o momento a partir do qual as esperas passam a contar, sempre que o alcance do aviso aumenta. */
export function prepararParaSalvar(novo: SlaResposta, anterior: SlaResposta | undefined, agora = new Date()): SlaResposta {
  const ampliou = novo.ativo && (
    !anterior?.ativo
    || (anterior.modoTeste && !novo.modoTeste)
    || (!anterior.rodizio && novo.rodizio)
  );
  return { ...novo, ativadoEm: ampliou ? agora.toISOString() : (anterior?.ativadoEm ?? novo.ativadoEm) };
}
