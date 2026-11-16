import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { agoraNoFuso, calcularAlertas, metricasDoDia, type Agora } from "../../lib/agendamento/engine";
import { chamar, definirTenantAtivo, configParaEngine, linhaParaReserva, ErroApi, type ConfigLinha, type Reserva } from "../../lib/agendamento/cliente";

type Permissoes = Record<"criar" | "editar" | "cancelar" | "receber" | "sem_contato", boolean>;

/** Agenda do dia: configuração, reservas (com tempo real) e as ações da equipe. */
export function useAgendamento(data: string) {
  const { activeTenantId } = useAuth();
  definirTenantAtivo(activeTenantId);
  const [config, setConfig] = useState<ConfigLinha | null>(null);
  const [admin, setAdmin] = useState(false);
  const [permissoes, setPermissoes] = useState<Permissoes>({ criar: true, editar: true, cancelar: false, receber: true, sem_contato: false });
  const [linkPublico, setLinkPublico] = useState<string | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [pendencias, setPendencias] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState<Agora>(() => agoraNoFuso());
  const fuso = config?.fuso ?? "America/Sao_Paulo";

  useEffect(() => { const t = setInterval(() => setAgora(agoraNoFuso(Date.now(), fuso)), 30000); setAgora(agoraNoFuso(Date.now(), fuso)); return () => clearInterval(t); }, [fuso]);

  const carregarConfig = useCallback(async () => {
    try {
      const j = await chamar<{ config: ConfigLinha; admin: boolean; permissoes: Permissoes; linkPublico: string | null }>("GET", "/api/agendamento/config");
      setConfig(j.config); setAdmin(j.admin); setPermissoes(j.permissoes); setLinkPublico(j.linkPublico); setErro(null);
    } catch (e: any) { setErro(e instanceof ErroApi && e.code === "modulo_desligado" ? "modulo" : e?.message || "Falha ao carregar"); }
  }, []);

  const carregarReservas = useCallback(async () => {
    if (!supabase || !activeTenantId) return;
    const hoje = agoraNoFuso(Date.now(), fuso).data;
    const [dia, pend] = await Promise.all([
      supabase.from("agendamento_reservas").select("*").eq("tenant_id", activeTenantId).eq("data", data).order("inicio_min", { ascending: true }),
      supabase.from("agendamento_reservas").select("*").eq("tenant_id", activeTenantId).lte("data", hoje).eq("status_pagamento", "Pendente").neq("status", "Cancelada").order("data", { ascending: false }).limit(100),
    ]);
    if (dia.error) { setErro(/agendamento_reservas/.test(dia.error.message) ? "tabela" : dia.error.message); return; }
    setReservas((dia.data || []).map(linhaParaReserva));
    setPendencias((pend.data || []).map(linhaParaReserva));
  }, [activeTenantId, data, fuso]);

  useEffect(() => { setCarregando(true); carregarConfig().finally(() => setCarregando(false)); }, [carregarConfig, activeTenantId]);
  useEffect(() => { if (config) carregarReservas(); }, [config, carregarReservas]);

  // Tempo real: qualquer mudança nas reservas da empresa (site, outro atendente, aviso do Mercado Pago) atualiza a tela.
  const recarregar = useRef(carregarReservas); recarregar.current = carregarReservas;
  useEffect(() => {
    if (!supabase || !activeTenantId || !config) return;
    const canal = supabase.channel(`agendamento-${activeTenantId}`).on("postgres_changes", { event: "*", schema: "public", table: "agendamento_reservas", filter: `tenant_id=eq.${activeTenantId}` }, () => recarregar.current()).subscribe();
    const t = setInterval(() => recarregar.current(), 60000); // rede de segurança: pendentes que vencem sem ninguém mexer
    return () => { clearInterval(t); supabase!.removeChannel(canal); };
  }, [activeTenantId, config?.tenant_id]);

  const engine = useMemo(() => (config ? configParaEngine(config) : null), [config]);
  const metricas = useMemo(() => metricasDoDia(reservas.filter((r) => r.status !== "Cancelada")), [reservas]);
  const alertas = useMemo(() => {
    if (!config) return [];
    const unicas = new Map<string, Reserva>();
    for (const r of [...pendencias, ...reservas]) unicas.set(r.id, r);
    return calcularAlertas([...unicas.values()], agora, config.expiracao_pendente_min);
  }, [pendencias, reservas, agora, config]);

  /** Executa uma ação e mostra a mensagem de erro do servidor; devolve true se deu certo. */
  const executar = useCallback(async (fn: () => Promise<unknown>, sucesso?: string): Promise<boolean> => {
    try { await fn(); if (sucesso) toast.success(sucesso); await carregarReservas(); return true; }
    catch (e: any) { toast.error(e?.message || "Não foi possível concluir."); await carregarReservas(); return false; }
  }, [carregarReservas]);

  return { config, engine, admin, permissoes, linkPublico, reservas, pendencias, metricas, alertas, agora, carregando, erro, carregarConfig, carregarReservas, executar };
}
