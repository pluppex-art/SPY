// Definições da paleta de componentes do canvas "Gatilho → Funis / OS" e dos
// tipos de ação que uma conexão pode ter — espelha 1:1 o que a migration
// automation_connection_multistep.sql realmente executa (tabela
// automation_connection_acoes). Nenhum tipo listado aqui é decorativo: todos
// os 7 tipos de ação (criar_os, tarefa, notificar, crm_update, mover_funil,
// mensagem, api_call) têm uma implementação real no banco (ver
// executar_automacao_connection) — "mensagem" é a única que depende de rede
// (WhatsApp via WAHA, com instância conectada), o resto é insert/update
// direto, sem dependência externa.

import {
  Zap, Filter, MessageSquare, ClipboardList, Bell, Link2, Globe2, Workflow, Briefcase,
} from "lucide-react";

export type AcaoTipo = "criar_os" | "tarefa" | "notificar" | "crm_update" | "mover_funil" | "mensagem" | "api_call";

export interface ComponentePaleta {
  id: string;
  categoria: "Gatilhos" | "Condições" | "Ações" | "Integrações" | "Funis" | "Ordens de Serviço (OS)";
  nome: string;
  descricao: string;
  icon: typeof Zap;
  acaoTipo?: AcaoTipo;
  isCondicao?: boolean;
}

export const PALETA: ComponentePaleta[] = [
  { id: "gat-novo-lead", categoria: "Gatilhos", nome: "Etapa do Funil", descricao: "Lead entra numa etapa específica", icon: Zap },
  { id: "gat-categoria", categoria: "Gatilhos", nome: "Categoria de Produto", descricao: "Proposta aceita com essa categoria", icon: Zap },
  { id: "cond-regra", categoria: "Condições", nome: "Condição", descricao: "Só continua se a regra for verdadeira", icon: Filter, isCondicao: true },
  { id: "acao-mensagem", categoria: "Ações", nome: "Enviar Mensagem", descricao: "WhatsApp (ativo) · E-mail, SMS em breve", icon: MessageSquare, acaoTipo: "mensagem" },
  { id: "acao-tarefa", categoria: "Ações", nome: "Criar Tarefa", descricao: "No CRM, com responsável e prazo", icon: ClipboardList, acaoTipo: "tarefa" },
  { id: "acao-notificar", categoria: "Ações", nome: "Notificar Time", descricao: "Avisa um usuário ou toda a equipe", icon: Bell, acaoTipo: "notificar" },
  { id: "int-crm", categoria: "Integrações", nome: "CRM", descricao: "Atualizar um campo do lead", icon: Link2, acaoTipo: "crm_update" },
  { id: "int-api", categoria: "Integrações", nome: "Sistema / API", descricao: "Dispara os webhooks externos configurados", icon: Globe2, acaoTipo: "api_call" },
  { id: "funil-mover", categoria: "Funis", nome: "Mover no Funil", descricao: "Muda o lead de funil/etapa", icon: Workflow, acaoTipo: "mover_funil" },
  { id: "os-criar", categoria: "Ordens de Serviço (OS)", nome: "Criar OS", descricao: "Abre uma ordem de serviço no departamento", icon: Briefcase, acaoTipo: "criar_os" },
];

export const CATEGORIAS_ORDEM: ComponentePaleta["categoria"][] = ["Gatilhos", "Condições", "Ações", "Integrações", "Funis", "Ordens de Serviço (OS)"];

export const ACAO_LABEL: Record<AcaoTipo, string> = {
  criar_os: "Criar OS",
  tarefa: "Criar Tarefa",
  notificar: "Notificar Time",
  crm_update: "Atualizar CRM",
  mover_funil: "Mover no Funil",
  mensagem: "Enviar Mensagem",
  api_call: "Sistema / API",
};

export const ACAO_ICON: Record<AcaoTipo, typeof Zap> = {
  criar_os: Briefcase,
  tarefa: ClipboardList,
  notificar: Bell,
  crm_update: Link2,
  mover_funil: Workflow,
  mensagem: MessageSquare,
  api_call: Globe2,
};

export function resumoAcao(tipo: AcaoTipo, config: Record<string, any>): string {
  switch (tipo) {
    case "criar_os": return "Abre uma OS no departamento desta conexão";
    case "tarefa": return config.titulo ? `"${config.titulo}"` : "Sem título ainda";
    case "notificar": return config.destinatario_id ? "Para 1 pessoa" : "Para toda a equipe";
    case "crm_update": return config.chave ? `${config.chave} = ${config.valor || "—"}` : "Sem campo definido";
    case "mover_funil": return config.pipeline_id ? `Pipeline: ${config.pipeline_id}` : "Sem destino definido";
    case "mensagem": return config.texto ? `"${config.texto.slice(0, 40)}${config.texto.length > 40 ? "…" : ""}"` : "Sem texto ainda";
    case "api_call": return "Dispara os webhooks externos ativos (Configurações › Integrações)";
    default: return "";
  }
}

export interface CondicaoConfig { campo: string; operador: string; valor: string }
export const CONDICAO_CAMPOS = [
  { id: "scoreIA", label: "Score IA", tipo: "numero" },
  { id: "timeIdle", label: "Dias parado", tipo: "numero" },
  { id: "valor", label: "Valor do negócio", tipo: "numero" },
  { id: "origem", label: "Origem do lead", tipo: "texto" },
];
export const CONDICAO_OPERADORES_NUMERO = [
  { id: "maior", label: "é maior que" },
  { id: "menor", label: "é menor que" },
  { id: "igual", label: "é igual a" },
];
export const CONDICAO_OPERADORES_TEXTO = [
  { id: "igual", label: "é igual a" },
  { id: "contem", label: "contém" },
];
