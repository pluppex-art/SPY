import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import { normalizarUrl, TIPOS_AMBIENTE } from '../lib/ambientes';
import type { DadosAmbiente, DevEnvironment, EnvStatus } from '../hooks/useAmbientes';

const rotulo = 'text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider';
const campo = 'w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]';
const vazio: DadosAmbiente = { name: '', type: 'Produção', status: 'operacional', url: '', version: '', region: '' };

interface Props {
  aberto: boolean;
  ambiente: DevEnvironment | null;
  onClose: () => void;
  onSalvar: (dados: DadosAmbiente, id?: string) => Promise<boolean>;
}

export function AmbienteModal({ aberto, ambiente, onClose, onSalvar }: Props) {
  const [f, setF] = useState<DadosAmbiente>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setF(ambiente ? { name: ambiente.name, type: ambiente.type, status: ambiente.status, url: ambiente.url, version: ambiente.version, region: ambiente.region } : vazio);
  }, [aberto, ambiente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const campos = (chave: keyof DadosAmbiente) => ({ value: f[chave], onChange: (e: { target: { value: string } }) => { setErro(''); setF((x) => ({ ...x, [chave]: e.target.value })); }, className: campo });
  const tipos = Array.from(new Set<string>([...TIPOS_AMBIENTE, f.type]));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizarUrl(f.url);
    if (!f.name.trim()) { setErro('Dê um nome ao ambiente.'); return; }
    if (f.url.trim() && !url) { setErro('Endereço inválido. Exemplo: https://meusistema.com.br'); return; }
    setSalvando(true);
    const ok = await onSalvar({ ...f, name: f.name.trim(), url, version: f.version.trim(), region: f.region.trim() }, ambiente?.id);
    setSalvando(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={aberto} onClose={onClose} maxWidth="max-w-lg" title={ambiente ? 'Editar ambiente' : 'Novo ambiente'} description="Com um endereço preenchido, o status é verificado automaticamente.">
      <form onSubmit={salvar} className="space-y-3">
        <label className="block space-y-1.5"><span className={rotulo}>Nome</span><input autoFocus placeholder="Ex.: SPY CRM" {...campos('name')} /></label>
        <label className="block space-y-1.5"><span className={rotulo}>Endereço (URL)</span><input placeholder="https://..." inputMode="url" {...campos('url')} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5"><span className={rotulo}>Tipo</span><select {...campos('type')}>{tipos.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="block space-y-1.5"><span className={rotulo}>Status</span>
            <select {...campos('status')}>
              {([['operacional', 'Operacional'], ['degradado', 'Degradado'], ['offline', 'Offline'], ['em deploy', 'Em deploy']] as [EnvStatus, string][]).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5"><span className={rotulo}>Versão</span><input placeholder="Opcional" {...campos('version')} /></label>
          <label className="block space-y-1.5"><span className={rotulo}>Servidor / região</span><input placeholder="Opcional" {...campos('region')} /></label>
        </div>
        {erro && <p className="text-xs text-rose-500">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold">Cancelar</Button>
          <Button type="submit" disabled={salvando} className="h-10 px-6 text-xs font-bold">{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  );
}
