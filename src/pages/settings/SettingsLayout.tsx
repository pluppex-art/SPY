import { useState, useEffect } from 'react';
import { Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Building, Plug, Columns3, Briefcase, Zap, Wallet, HardDrive, UserRound, Users, Brain } from "lucide-react";
import { MODULE_SETTINGS } from "./moduleSettings";
import { MODULE_SETTINGS_REGISTRY, moduleSettingsPath } from "./moduleSettingsRegistry";
import { SectionSidebar, type SectionNavGroup } from "../../components/layout/SectionSidebar";


/** Explicação de cada página das Configurações — aparece no "?" ao lado do item do menu. */
const AJUDA: Record<string, string> = {
  "/app/configuracoes/usuario/perfil": "Seus dados pessoais e a segurança da sua conta: foto, bio, senha e autenticação em 2 fatores. Nome, telefone e cargo são editados em Equipe (RH).",
  "/app/configuracoes/usuario/preferencias": "Como o SPY aparece para você: tema (escuro, claro ou o mesmo do seu aparelho), idioma e moeda.",
  "/app/configuracoes/usuario/notificacoes": "Escolha como você quer ser avisado dos eventos da operação comercial: no painel, por e-mail, por WhatsApp ou no navegador. Marque só os canais que você realmente olha.",
  "/app/configuracoes/empresa/dados": "Os dados cadastrais, fiscais e de contato da sua empresa. Também é aqui que você escreve o perfil da empresa que a IA usa para falar com os clientes.",
  "/app/configuracoes/empresa/plano": "Sua assinatura e quanto da inteligência artificial você já usou neste mês.",
  "/app/configuracoes/empresa/lgpd": "Atenda pedidos dos titulares dos dados, como exportar, anonimizar e registrar consentimento. Tudo fica registrado para auditoria.",
  "/app/configuracoes/empresa/filiais": "Cadastre as filiais da empresa e os clientes que você atende. No seletor da barra lateral, a visão consolidada mostra tudo, e escolher um mostra só os dados dele.",
  "/app/configuracoes/empresa/nichos": "Os nichos são os segmentos de negócio da sua empresa e servem para classificar leads e clientes. Cada empresa tem os seus próprios.",
  "/app/configuracoes/empresa/equipe": "Convide novas pessoas para a sua empresa no SPY e gerencie o acesso de cada uma.",
  "/app/configuracoes/empresa/cargos": "Cadastre os cargos da empresa e organize a hierarquia. Os cargos definem o que cada pessoa pode ver e fazer no sistema.",
  "/app/configuracoes/empresa/permissoes": "Para cada cargo, defina quais páginas e quais IAs a pessoa vê e se ela enxerga todos os dados ou só os próprios.",
  "/app/configuracoes/crm/funis": "Configure os funis de venda, as etapas de cada um e como o SDR IA se comporta em cada funil.",
  "/app/configuracoes/crm/origens": "Cadastre de onde seus leads vêm (indicação, anúncio, site…). Isso permite ver depois quais canais trazem mais receita.",
  "/app/configuracoes/crm/fidelidade": "Classifique os clientes em níveis (Bronze, Prata, Ouro…) conforme o número de compras. O nível aparece na lista de Clientes e dá para filtrar por ele.",
  "/app/configuracoes/crm/produtos": "Personalize quais informações você guarda sobre produtos e serviços. O catálogo em si fica em Produtos, no menu lateral.",
  "/app/configuracoes/crm/campos": "Crie campos extras nos leads, escolha o tipo de cada um (texto, número, data…) e as regras de validação, para guardar as informações específicas do seu negócio.",
  "/app/configuracoes/crm/sla": "O SLA é o prazo máximo para a equipe fazer o primeiro contato com um lead novo. Defina o prazo e, se ele estourar, o sistema avisa e cobra a equipe.",
  "/app/configuracoes/crm/gatilhos-ia": "Crie regras para o sistema mover o lead de etapa sozinho conforme a nota dele (Lead Score IA), por exemplo levando quem esquenta para o funil de SDR.",
  "/app/configuracoes/crm/rodizio": "Defina como os leads são distribuídos automaticamente entre SDRs e closers, de acordo com a capacidade de cada um e as tags do lead.",
  "/app/configuracoes/produtividade/categorias": "Organize as categorias das tarefas e veja o CAC (quanto custa conquistar cada cliente) de cada time comercial.",
  "/app/configuracoes/kanbans": "Personalize as colunas, cores e etapas dos quadros de tarefas, marketing e educação para o fluxo de trabalho ficar do jeito da sua equipe.",
  "/app/configuracoes/os/funis": "Cadastre os departamentos da empresa e as etapas do fluxo de cada um. Cada departamento vira uma aba na página de Ordens de Serviço.",
  "/app/configuracoes/financeiro/categorias": "As categorias classificam suas receitas e despesas. A combinação de tipo e subtipo define em qual linha do DRE cada lançamento entra na soma.",
  "/app/configuracoes/financeiro/squads": "Informe o orçamento mensal de cada squad (time). Com ele o sistema calcula, em tempo real, o CAC: quanto custa conquistar cada cliente.",
  "/app/configuracoes/financeiro/bloqueio-periodo": "Ao bloquear um período (por exemplo, um mês já fechado), lançamentos pagos naquele período não podem mais ser criados, editados nem excluídos. Lançamentos pendentes continuam livres.",
  "/app/configuracoes/financeiro/auditoria": "Todo lançamento criado, editado ou excluído fica registrado aqui, com quem fez, quando fez e o que mudou.",
  "/app/configuracoes/engajamento/modelos": "Textos prontos que a empresa usa nas comunicações automáticas. Edite aqui para manter o tom e as informações sempre certos.",
  "/app/configuracoes/engajamento/automacoes": "A Central de Automações: gatilhos de mensagem criados por texto (a IA monta e você aprova) e conexões que levam uma etapa do funil ou um produto vendido para um departamento, gerando a ordem de serviço sozinha.",
  "/app/configuracoes/integracoes/conexoes": "Conecte as contas da sua empresa. O que for sincronizado fica disponível para a Aurora responder com informações reais, sempre apenas do seu usuário.",
  "/app/configuracoes/integracoes/apps": "A central para ligar o SPY aos seus aplicativos e anúncios, como Meta Ads e Google Ads, e acompanhar as conversões.",
  "/app/configuracoes/integracoes/smtp": "Configure o servidor de e-mail da empresa para os e-mails do sistema saírem com o seu remetente.",
  "/app/configuracoes/integracoes/webhooks": "Cadastre endereços que recebem um aviso automático quando algo acontece no SPY, e acompanhe o registro dos envios.",
  "/app/configuracoes/integracoes/sdr-webhooks": "Cadastre os endereços de integração das automações de pré-vendas e teste a conexão com o botão Disparar Teste.",
  "/app/configuracoes/integracoes/conectores-externos": "Ligue o sistema que a sua empresa já usa (um sistema próprio ou outro) ao SPY, de forma segura e autenticada. Depois, ative os eventos que devem ser enviados automaticamente para ele.",
  "/app/configuracoes/integracoes/links-dinamicos": "Cadastre os links reais que a sua empresa já usa (pagamento, agendamento, checkout, contrato). A Aurora e a IA consultam esta lista na hora de responder, e a mudança vale imediatamente.",
  "/app/ia": "Tudo da Aurora num lugar só: consumo, atividade, funil, agentes e conhecimento.",
  "/app/configuracoes/sistema/aurora": "Controle da Aurora: o consumo de IA do mês, os agentes ligados a ela, e quais estão ativos para a sua empresa.",
  "/app/configuracoes/sistema/treinamento": "Cada agente tem uma instrução-base igual para todas as empresas, que se edita aqui. Os outros 20%, específicos de cada empresa, vêm de Empresa → Dados e de Produtos.",
  "/app/configuracoes/sistema/backups": "Como os backups do banco de dados são feitos. Eles são automáticos e gerenciados pelo Supabase, de acordo com o plano contratado do projeto.",
};

export default function SettingsLayout() {
  const { user, isModuleEnabled } = useAuth();

  const [activeModules, setActiveModules] = useState<{ [key: string]: boolean }>({
    crm: true, educacao: true, produtividade: true, financeiro: true,
    catalogo: true, marketing: true, engajamento: true, rh: true, bi: true, clinica: true,
  });

  useEffect(() => {
    const handleChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail) setActiveModules(customEvent.detail);
    };
    window.addEventListener("spy_modules_changed", handleChanged);
    return () => window.removeEventListener("spy_modules_changed", handleChanged);
  }, []);

  const aurora = isModuleEnabled("aurora");
  const grupos: SectionNavGroup[] = [
    {
      title: "Minha conta",
      icon: UserRound,
      items: [
        { title: "Meu Perfil & Conta", path: "/app/configuracoes/usuario/perfil" },
        { title: "Preferências do Sistema", path: "/app/configuracoes/usuario/preferencias" },
        { title: "Preferências de Notificação", path: "/app/configuracoes/usuario/notificacoes" },
      ],
    },
    {
      title: "Empresa",
      icon: Building,
      items: [
        { title: "Dados da empresa", path: "/app/configuracoes/empresa/dados" },
        { title: "Filiais e clientes", path: "/app/configuracoes/empresa/filiais" },
        { title: "Nichos", path: "/app/configuracoes/empresa/nichos" },
        { title: "Plano & Uso", path: "/app/configuracoes/empresa/plano" },
        { title: "LGPD", path: "/app/configuracoes/empresa/lgpd" },
        ...(user?.isMaster ? [{ title: "Módulos & SaaS (Admin)", path: "/app/admin?tab=modules" }] : []),
      ],
    },
    {
      title: "Equipe & Acessos",
      icon: Users,
      items: [
        { title: "Equipe & convites", path: "/app/configuracoes/empresa/equipe" },
        { title: "Cargos", path: "/app/configuracoes/empresa/cargos" },
        { title: "Perfis & permissões", path: "/app/configuracoes/empresa/permissoes" },
      ],
    },
    ...(activeModules.crm ? [{
      title: "Vendas",
      icon: Columns3,
      items: [
        { title: "Funis & etapas", path: "/app/configuracoes/crm/funis" },
        { title: "Origens de leads", path: "/app/configuracoes/crm/origens" },
        { title: "Campos personalizados", path: "/app/configuracoes/crm/campos" },
        { title: "Produtos", path: "/app/configuracoes/crm/produtos" },
        { title: "Rodízio de Leads", path: "/app/configuracoes/crm/rodizio" },
        { title: "Prazos de atendimento (SLA)", path: "/app/configuracoes/crm/sla" },
        { title: "Fidelidade de clientes", path: "/app/configuracoes/crm/fidelidade" },
      ],
    }] : []),
    ...(activeModules.produtividade ? [{
      title: "Operações & Tarefas",
      icon: Briefcase,
      items: [
        { title: "Categorias de tarefas", path: "/app/configuracoes/produtividade/categorias" },
        { title: "Funis & Quadros (Kanban)", path: "/app/configuracoes/kanbans" },
        { title: "Departamentos da OS", path: "/app/configuracoes/os/funis" },
      ],
    }] : []),
    ...(activeModules.financeiro ? [{
      title: "Financeiro",
      icon: Wallet,
      items: [
        { title: "Categorias financeiras", path: "/app/configuracoes/financeiro/categorias" },
        { title: "Gestão financeira de times", path: "/app/configuracoes/financeiro/squads" },
        { title: "Bloqueio de período", path: "/app/configuracoes/financeiro/bloqueio-periodo" },
        { title: "Auditoria financeira", path: "/app/configuracoes/financeiro/auditoria" },
        { title: "Integrações bancárias", path: "/app/configuracoes/financeiro/integracoes", soon: true },
      ],
    }] : []),
    ...(activeModules.marketing || activeModules.engajamento ? [{
      title: "Comunicação & Automações",
      icon: Zap,
      items: [
        { title: "Modelos de mensagem", path: "/app/configuracoes/engajamento/modelos" },
        { title: "Automações", path: "/app/configuracoes/engajamento/automacoes" },
      ],
    }] : []),
    // Configurações dos módulos verticais: só aparecem para quem tem o módulo ligado.
    ...MODULE_SETTINGS.filter((m) => isModuleEnabled(m.moduleId)).map((m) => ({ title: m.title, icon: m.icon, items: m.items })),
    ...MODULE_SETTINGS_REGISTRY.filter((m) => m.sections.length > 0 && isModuleEnabled(m.moduleId)).map((m) => ({
      title: m.title, icon: m.icon, items: m.sections.map((sec) => ({ title: sec.title, path: moduleSettingsPath(m.moduleId, sec.id), help: sec.subtitle })),
    })),
    {
      title: "Inteligência Artificial",
      icon: Brain,
      items: [
        ...(aurora ? [{ title: "Visão geral", path: "/app/ia" }] : []),
        // Página única de Aurora (controle, prompts, consumo e agentes).
        ...(aurora ? [{ title: "Aurora", path: "/app/configuracoes/sistema/aurora" }] : []),
        ...(activeModules.crm ? [{ title: "Gatilhos da IA", path: "/app/configuracoes/crm/gatilhos-ia" }] : []),
        { title: "Links dos assistentes", path: "/app/configuracoes/integracoes/links-dinamicos" },
        ...(user?.isMaster && aurora ? [{ title: "Treinamento dos agentes", path: "/app/configuracoes/sistema/treinamento" }] : []),
      ],
    },
    {
      title: "Integrações",
      icon: Plug,
      items: [
        { title: "Conexões (Google e outras contas)", path: "/app/configuracoes/integracoes/conexoes" },
        { title: "Central de Aplicativos & Ads", path: "/app/configuracoes/integracoes/apps" },
        { title: "Servidores SMTP (E-mail)", path: "/app/configuracoes/integracoes/smtp" },
        { title: "Integrações automáticas & Logs (Webhooks)", path: "/app/configuracoes/integracoes/webhooks" },
        { title: "Automações de Pré-Vendas (Webhooks de SDR)", path: "/app/configuracoes/integracoes/sdr-webhooks" },
        { title: "Conectar outros sistemas", path: "/app/configuracoes/integracoes/conectores-externos" },
      ],
    },
    {
      title: "Sistema",
      icon: HardDrive,
      items: [
        { title: "Backups automáticos", path: "/app/configuracoes/sistema/backups" },
      ],
    },
  ];

  // Cada item recebe o seu "?" com a explicação (quando existe).
  const groups: SectionNavGroup[] = grupos.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, help: i.help ?? AJUDA[i.path] })) }));

  return (
    <SectionSidebar heading="Configurações" subheading="Gerenciamento Geral" groups={groups}>
      <Outlet />
    </SectionSidebar>
  );
}
