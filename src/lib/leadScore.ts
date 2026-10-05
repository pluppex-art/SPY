/**
 * Utilitário centralizado para cálculo de Score IA e Temperatura do Lead.
 * Considera ativamente:
 * 1. A ETAPA atual no funil / pipeline (e sua progressão).
 * 2. As NOTAS do cliente (histórico de anotações, engajamento, sinais de compra e objeções).
 * 3. Prioridade e indicadores de fechamento.
 */

export interface NoteItem {
  id?: string;
  text: string;
  createdAt?: string;
  author?: string;
  category?: "chamada" | "interesse" | "objecao" | "decisor" | "geral";
}

export interface LeadScoreResult {
  score: number;
  temperature: "Quente" | "Morno" | "Frio";
  rawTemperature: "quente" | "morno" | "frio";
  probability: number;
  reasons: string[];
}

export function parseLeadNotes(notesRaw: any): NoteItem[] {
  if (!notesRaw) return [];
  if (Array.isArray(notesRaw)) return notesRaw;
  if (typeof notesRaw === "string") {
    try {
      const parsed = JSON.parse(notesRaw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    if (notesRaw.trim()) {
      return [{ text: notesRaw.trim() }];
    }
  }
  return [];
}

export function normalizeText(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Calcula o score do lead (0 a 100) com base na etapa e nas anotações.
 */
export function calculateLeadScore(
  lead: {
    status?: string;
    stageId?: string;
    priority?: string;
    temperature?: string;
    notes?: any;
    [key: string]: any;
  },
  stageNameOrObj?: string | { id?: string; name?: string; status?: string } | null,
  stagesList?: Array<{ id: string; name: string }> | null,
  extraNotes?: NoteItem[]
): LeadScoreResult {
  const reasons: string[] = [];

  // 1. Identificar Nome e Status da Etapa
  let stageName = "";
  let stageStatus = lead.status || "";

  if (typeof stageNameOrObj === "string") {
    stageName = stageNameOrObj;
  } else if (stageNameOrObj && typeof stageNameOrObj === "object") {
    stageName = stageNameOrObj.name || "";
    if (stageNameOrObj.status) stageStatus = stageNameOrObj.status;
  }

  // Se não foi passado explicitamente, tenta localizar na lista de etapas ou no próprio lead
  if (!stageName && stagesList && lead.stageId) {
    const foundStage = stagesList.find((s) => String(s.id) === String(lead.stageId));
    if (foundStage) stageName = foundStage.name;
  }
  if (!stageName && lead.stage) {
    stageName = String(lead.stage);
  }

  const normStage = normalizeText(stageName);
  const normStatus = normalizeText(stageStatus);

  // 2. Pontuação Baseada na Etapa (Stage Score)
  let stageScore = 35; // Default para início do funil

  if (normStatus.includes("ganho") || normStatus.includes("fechado") || normStage.includes("ganho") || normStage.includes("fechado") || normStage.includes("venda realizada")) {
    stageScore = 96;
    reasons.push("Etapa de Fechamento / Venda Ganha (+96 pts base)");
  } else if (normStatus.includes("perdido") || normStatus.includes("desqualific") || normStage.includes("perdido") || normStage.includes("desqualific") || normStage.includes("desist")) {
    stageScore = 12;
    reasons.push("Etapa marcada como Perdido / Desqualificado / Desistência (12 pts base)");
  } else if (normStage.includes("negocia") || normStage.includes("proposta") || normStage.includes("contrato") || normStage.includes("fechamento")) {
    stageScore = 80;
    reasons.push("Etapa avançada de Proposta / Negociação (+80 pts base)");
  } else if (normStage.includes("reunia") || normStage.includes("apresenta") || normStage.includes("demo")) {
    stageScore = 65;
    reasons.push("Etapa de Reunião / Demonstração (+65 pts base)");
  } else if (normStage.includes("diagnostico") || normStage.includes("qualifica") || normStage.includes("contato") || normStage.includes("em andamento")) {
    stageScore = 48;
    reasons.push("Etapa de Qualificação / Contato Inicial (+48 pts base)");
  } else if (normStage.includes("novo") || normStage.includes("prospec") || normStage.includes("entrada")) {
    stageScore = 30;
    reasons.push("Etapa inicial de Prospecção (+30 pts base)");
  } else if (stagesList && stagesList.length > 1 && lead.stageId) {
    const stageIdx = stagesList.findIndex((s) => String(s.id) === String(lead.stageId));
    if (stageIdx >= 0) {
      const progressRatio = stageIdx / (stagesList.length - 1);
      stageScore = Math.round(30 + progressRatio * 55);
      reasons.push(`Progresso no funil (${Math.round(progressRatio * 100)}% das etapas: +${stageScore} pts base)`);
    }
  }

  // 3. Pontuação Baseada nas Notas do Cliente (Notes Score)
  const allNotes: NoteItem[] = [
    ...parseLeadNotes(lead.notes),
    ...(extraNotes || []),
  ];

  let notesDelta = 0;

  if (allNotes.length === 0) {
    reasons.push("Nenhuma anotação registrada ainda (score neutro)");
  } else {
    // Engajamento por volume de anotações
    if (allNotes.length >= 6) {
      notesDelta += 10;
      reasons.push(`Alto histórico de acompanhamento (${allNotes.length} notas: +10 pts)`);
    } else if (allNotes.length >= 3) {
      notesDelta += 6;
      reasons.push(`Histórico consistente de acompanhamento (${allNotes.length} notas: +6 pts)`);
    } else {
      notesDelta += 3;
      reasons.push(`Anotações iniciadas (${allNotes.length} nota(s): +3 pts)`);
    }

    const fullCorpus = normalizeText(allNotes.map((n) => n.text || "").join(" "));

    // Sinais Positivos Fortes
    const regexHighPositive = /fechar|contrato|orcamento|comprar|pagamento|aprovad|assin|investir|decisor|diretor|urgente|interesse alto|proposta aceita|pix|cartao aprovad|comprovante/;
    if (regexHighPositive.test(fullCorpus)) {
      notesDelta += 20;
      reasons.push("Sinais fortes de intenção de compra identificados nas notas (+20 pts)");
    }

    // Sinais Positivos Médios
    const regexMediumPositive = /gostou|elog|avancar|alinhad|positivo|otimo|excelente|animado|validado|reuniao agendada|interesse/;
    if (regexMediumPositive.test(fullCorpus)) {
      notesDelta += 10;
      reasons.push("Sentimento favorável e alinhamento do cliente (+10 pts)");
    }

    // Categorias de Notas
    const hasInteresseCat = allNotes.some((n) => n.category === "interesse" || n.category === "decisor");
    if (hasInteresseCat) {
      notesDelta += 8;
      reasons.push("Notas com categoria de Decisor/Interesse registradas (+8 pts)");
    }

    // Sinais Negativos e Objeções Fortes
    const regexHighNegative = /caro|sem verba|sem dinheiro|sem orcamento|concorrente|desist|rejeit|nao tem interesse|adiou|sumiu|sem retorno|bloqueou|cancelou|reclamou|nao quer/;
    if (regexHighNegative.test(fullCorpus)) {
      notesDelta -= 22;
      reasons.push("Objeções severas ou concorrência detectadas nas notas (-22 pts)");
    }

    // Sinais Negativos Moderados / Adiamentos
    const regexMediumNegative = /ocupado|retornar depois|ano que vem|mes que vem|avaliando|sem pressa|em analise/;
    if (regexMediumNegative.test(fullCorpus)) {
      notesDelta -= 10;
      reasons.push("Ciclo de decisão postergado pelo cliente (-10 pts)");
    }

    const hasObjecaoCat = allNotes.some((n) => n.category === "objecao");
    if (hasObjecaoCat) {
      notesDelta -= 10;
      reasons.push("Anotações de Objeção registradas pelo consultor (-10 pts)");
    }
  }

  // 4. Prioridade
  let priorityDelta = 0;
  if (lead.priority === "Alta") {
    priorityDelta += 5;
    reasons.push("Prioridade Alta (+5 pts)");
  } else if (lead.priority === "Baixa") {
    priorityDelta -= 5;
    reasons.push("Prioridade Baixa (-5 pts)");
  }

  // 5. Consolidação e Calibração do Score Final
  // Peso: 50% Etapa do Funil, 50% Notas/Sentimento + Ajustes
  let finalScore = Math.round(stageScore * 0.55 + (50 + notesDelta) * 0.45 + priorityDelta);

  // Se o lead está expressamente ganho/fechado ou perdido, limites respeitam o status
  if (normStatus.includes("ganho") || normStatus.includes("fechado") || normStage.includes("ganho") || normStage.includes("fechado")) {
    finalScore = Math.max(90, Math.min(100, finalScore));
  } else if (normStatus.includes("perdido") || normStage.includes("perdido")) {
    finalScore = Math.max(5, Math.min(25, finalScore));
  } else {
    finalScore = Math.max(10, Math.min(95, finalScore));
  }

  // 6. Derivar Temperatura e Probabilidade
  const rawTemperature: "quente" | "morno" | "frio" =
    finalScore >= 70 ? "quente" : finalScore >= 40 ? "morno" : "frio";

  const temperature: "Quente" | "Morno" | "Frio" =
    finalScore >= 70 ? "Quente" : finalScore >= 40 ? "Morno" : "Frio";

  const probability =
    finalScore >= 80 ? 85 : finalScore >= 70 ? 70 : finalScore >= 40 ? 45 : 20;

  return {
    score: finalScore,
    temperature,
    rawTemperature,
    probability,
    reasons,
  };
}
