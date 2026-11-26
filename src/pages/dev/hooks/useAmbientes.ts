import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { apiFetch } from '../../../lib/apiClient';
import { useAuth } from '../../../contexts/AuthContext';
import { buscarSugestoes, type SugestaoAmbiente } from '../lib/ambientes';

export type EnvStatus = 'operacional' | 'degradado' | 'offline' | 'em deploy';

export interface DevEnvironment {
  id: string;
  name: string;
  type: string;
  status: EnvStatus;
  url: string;
  version: string;
  lastDeploy: string;
  region: string;
  /** Resultado da última verificação do endereço (vazio = nunca verificado). */
  check: { latency: string; http: number | null; aviso: string; em: string };
  services: { name: string; status: EnvStatus }[];
}

export type DadosAmbiente = Pick<DevEnvironment, 'name' | 'type' | 'status' | 'url' | 'version' | 'region'>;

function rowToEnv(row: any): DevEnvironment {
  const m = row.metrics || {};
  return {
    id: row.env_id,
    name: row.name,
    type: row.type,
    status: row.status as EnvStatus,
    url: row.url || '',
    version: row.version || '',
    lastDeploy: row.last_deploy && row.last_deploy !== '-' ? row.last_deploy : '',
    region: row.region || '',
    check: { latency: m.verificadoEm ? m.latency || '' : '', http: m.http ?? null, aviso: m.aviso || '', em: m.verificadoEm || '' },
    services: row.services || [],
  };
}

export function useAmbientes() {
  const { activeTenantId } = useAuth();
  const [environments, setEnvironments] = useState<DevEnvironment[]>([]);
  const [loading, setLoading] = useState(true);
  const [carregadoDe, setCarregadoDe] = useState('');

  const refetch = useCallback(async () => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('dev_environments')
      .select('*')
      .eq('tenant_id', activeTenantId)
      .order('created_at', { ascending: true });
    if (error) toast.error('Não foi possível carregar os ambientes.');
    else { setEnvironments((data ?? []).map(rowToEnv)); setCarregadoDe(activeTenantId); }
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => { setLoading(true); setEnvironments([]); setCarregadoDe(''); void refetch(); }, [refetch]);

  /** O servidor acessa cada endereço e grava o resultado. Sem ids = todos. */
  const verificar = useCallback(async (ids?: string[]) => {
    if (!activeTenantId) return;
    try {
      const r = await apiFetch(`/api/dev/ambientes/verificar?tenantId=${activeTenantId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Erro ${r.status}`);
      await refetch();
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível verificar os ambientes.');
    }
  }, [activeTenantId, refetch]);

  async function salvar(dados: DadosAmbiente, id?: string): Promise<boolean> {
    if (!supabase || !activeTenantId) return false;
    const linha = { name: dados.name, type: dados.type, status: dados.status, url: dados.url, version: dados.version, region: dados.region, updated_at: new Date().toISOString() };
    const novoId = id ?? crypto.randomUUID();
    const { error } = id
      ? await supabase.from('dev_environments').update(linha).eq('tenant_id', activeTenantId).eq('env_id', id)
      : await supabase.from('dev_environments').insert({ ...linha, env_id: novoId, tenant_id: activeTenantId });
    if (error) { toast.error('Não foi possível salvar o ambiente.'); return false; }
    toast.success(id ? 'Ambiente atualizado.' : 'Ambiente cadastrado.');
    await refetch();
    if (dados.url) void verificar([novoId]);
    return true;
  }

  async function excluir(id: string) {
    if (!supabase || !activeTenantId) return;
    const { error } = await supabase.from('dev_environments').delete().eq('tenant_id', activeTenantId).eq('env_id', id);
    if (error) { toast.error('Não foi possível excluir o ambiente.'); return; }
    setEnvironments((l) => l.filter((e) => e.id !== id));
    toast.success('Ambiente excluído.');
  }

  /** Publicações do GitHub conectado em Dev > Repositórios (a leitura do token é só para administradores). */
  const sugestoesGitHub = useCallback(async (): Promise<SugestaoAmbiente[]> => {
    if (!supabase || !activeTenantId) return [];
    const { data } = await supabase.from('app_settings').select('value').eq('tenant_id', activeTenantId).eq('key', 'github_config').maybeSingle();
    const cfg: any = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
    if (!cfg?.pat) throw new Error('GitHub não conectado. Um administrador precisa conectar em Dev > Repositórios.');
    return buscarSugestoes(cfg.pat);
  }, [activeTenantId]);

  /** O id do ambiente importado vem da origem, então importar de novo atualiza a versão em vez de duplicar. */
  const idImportado = useCallback((s: SugestaoAmbiente) => `gh:${activeTenantId}:${s.chave}`, [activeTenantId]);

  async function importar(sugestoes: SugestaoAmbiente[]): Promise<boolean> {
    if (!supabase || !activeTenantId || !sugestoes.length) return false;
    const agora = new Date().toISOString();
    const existentes = new Set(environments.map((e) => e.id));
    const novos = sugestoes.filter((s) => !existentes.has(idImportado(s)));
    const antigos = sugestoes.filter((s) => existentes.has(idImportado(s)));
    const respostas = await Promise.all([
      ...(novos.length ? [supabase.from('dev_environments').insert(novos.map((s) => ({ env_id: idImportado(s), tenant_id: activeTenantId, name: s.nome, type: s.tipo, url: s.url, version: s.versao, last_deploy: s.publicadoEm, region: '' })))] : []),
      // Quem já existe só recebe a versão e a data: nome e endereço podem ter sido ajustados à mão.
      ...antigos.map((s) => supabase!.from('dev_environments').update({ version: s.versao, last_deploy: s.publicadoEm, updated_at: agora }).eq('tenant_id', activeTenantId).eq('env_id', idImportado(s))),
    ]);
    if (respostas.some((r) => r.error)) { toast.error('Parte da importação falhou.'); await refetch(); return false; }
    toast.success(`${novos.length} ${novos.length === 1 ? 'ambiente novo' : 'ambientes novos'}${antigos.length ? ` · ${antigos.length} atualizado(s)` : ''}.`);
    await refetch();
    void verificar(sugestoes.map(idImportado));
    return true;
  }

  return { environments, loading, carregadoDe, refetch, verificar, salvar, excluir, sugestoesGitHub, importar, idImportado };
}
