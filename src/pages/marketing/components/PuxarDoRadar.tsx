/** Puxa empresas do Radar (pesquisa nova ou já salvas) para a lista própria da campanha. */
import { useRef, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { FiltroDoRadar } from "../../../components/radar/FiltroDoRadar";
import { pesquisarNoRadar, type FiltroRadar } from "../../../lib/buscaRadar";

export interface ContatoDoRadar { email: string; name: string; company: string }
/** `email` vazio com `procurando` = o site ainda está sendo lido. */
interface Item { empresa: string; detalhe: string; email: string; procurando?: boolean }

const temSite = (s: unknown): s is string => !!s && !/^n[ãa]o encontrado$/i.test(String(s));

export function PuxarDoRadar({ api, jaNaLista, onAdicionar }: {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  jaNaLista: string[];
  onAdicionar: (contatos: ContatoDoRadar[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<"buscar" | "salvas">("buscar");
  const [restante, setRestante] = useState<number | null>(null);
  const [mais, setMais] = useState<FiltroRadar | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set()); // desmarcados pela pessoa
  const pedido = useRef(0); // resposta atrasada de uma busca antiga não vale

  const ler = async (path: string, init?: RequestInit) => {
    const r = await api(path, init); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Falha na consulta.");
    return j;
  };
  /** `somar`: pedindo as próximas empresas, as que já apareceram continuam na lista. */
  const comecar = (somar = false) => { const n = ++pedido.current; setCarregando(true); setAviso(null); setMais(null); if (!somar) { setItens([]); setFora(new Set()); } return n; };

  const buscar = async (filtro: FiltroRadar, somar = false) => {
    const antes = somar ? itens : [];
    const n = comecar(somar);
    try {
      const busca = await pesquisarNoRadar(api, filtro);
      if (busca.restante !== null) setRestante(busca.restante);
      if (n !== pedido.current) return;
      setAviso(busca.aviso); setMais(busca.mais);
      const achados = busca.empresas;
      if (!achados.length) { setAviso("Nenhuma empresa encontrada. Tente outro tipo de empresa ou outra cidade."); return; }
      const lista: Item[] = achados.map((e) => ({ empresa: e.empresa, detalhe: e.endereco, email: e.email || "", procurando: !e.email && temSite(e.site) }));
      setItens([...antes, ...lista]); setCarregando(false);
      const sites = achados.filter((e, i) => lista[i].procurando).map((e) => e.site);
      if (!sites.length) return;
      let emails: Record<string, string> = {};
      try { for (let i = 0; i < sites.length && n === pedido.current; i += 20) Object.assign(emails, (await ler("/api/radar/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sites: sites.slice(i, i + 20) }) })).emails ?? {}); }
      catch (e: any) { if (n === pedido.current) setAviso(`Não consegui ler os sites: ${e.message}`); }
      if (n !== pedido.current) return;
      setItens([...antes, ...lista.map((item, i) => (item.procurando ? { ...item, email: emails[String(achados[i].site).trim().slice(0, 300)] || "", procurando: false } : item))]);
    } catch (e: any) { if (typeof e.restante === "number") setRestante(e.restante); if (n === pedido.current) setAviso(e.message); }
    finally { if (n === pedido.current) setCarregando(false); }
  };

  const abrirSalvas = async () => {
    setAba("salvas");
    const n = comecar();
    try {
      const j = await ler("/api/radar/empresas-salvas");
      if (n !== pedido.current) return;
      setItens(j.empresas ?? []);
      if (!j.empresas?.length) setAviso("Ainda não há empresas salvas com e-mail. Elas aparecem aqui depois de uma busca por CNAE, por exemplo: cnae 5611201 em Palmas/TO.");
    } catch (e: any) { if (n === pedido.current) setAviso(e.message); }
    finally { if (n === pedido.current) setCarregando(false); }
  };
  const abrirBusca = () => { setAba("buscar"); pedido.current++; setItens([]); setAviso(null); setCarregando(false); setMais(null); };

  const naLista = new Set(jaNaLista.map((e) => e.toLowerCase()));
  const disponiveis = itens.filter((i) => i.email && !naLista.has(i.email.toLowerCase()));
  const escolhidos = [...new Map(disponiveis.filter((i) => !fora.has(i.email)).map((i) => [i.email, i])).values()];
  const procurando = itens.some((i) => i.procurando);
  const adicionar = () => { onAdicionar(escolhidos.map((i) => ({ email: i.email, name: "", company: i.empresa }))); };

  if (!aberto) {
    return <Button type="button" variant="outline" onClick={() => setAberto(true)} className="h-9 px-3 text-xs font-bold gap-1.5"><Radar className="w-3.5 h-3.5" /> Puxar do Radar</Button>;
  }

  return (
    <div className="space-y-2 p-3 rounded-xl border border-[var(--color-primary-blue)]/40 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-primary)]"><Radar className="w-3.5 h-3.5" /> Puxar do Radar</span>
        {([["buscar", "Pesquisar", abrirBusca], ["salvas", "Já salvas", abrirSalvas]] as const).map(([id, rotulo, ir]) => (
          <button key={id} type="button" aria-pressed={aba === id} onClick={() => void ir()} className={cn("rounded-full border px-3 py-1 text-[11px] font-bold cursor-pointer", aba === id ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{rotulo}</button>
        ))}
        <button type="button" onClick={() => setAberto(false)} className="bg-transparent border-0 p-0 text-[11px] font-bold text-[var(--color-text-muted)] cursor-pointer">Fechar</button>
      </div>

      {aba === "buscar" && <FiltroDoRadar api={api} ocupado={carregando || itens.some((i) => i.procurando)} restante={restante} onSaldo={setRestante} onBuscar={(f) => void buscar(f)} />}

      {carregando && <p className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando o Radar…</p>}
      {aviso && <p role="status" className="text-[11px] text-amber-700 dark:text-amber-400">{aviso}</p>}

      {itens.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {itens.length} empresa(s) · <b className="text-[var(--color-text-primary)]">{itens.filter((i) => i.email).length} com e-mail</b>
            {procurando && <> · procurando e-mail nos sites… <Loader2 className="inline w-3 h-3 align-text-bottom animate-spin" /></>}
          </p>
          <ul className="max-h-56 overflow-auto m-0 p-0 list-none rounded-lg border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)]">
            {itens.map((i, n) => {
              const ja = !!i.email && naLista.has(i.email.toLowerCase());
              return (
                <li key={`${i.empresa}-${n}`}>
                  <label className={cn("flex items-start gap-2 px-2 py-1.5", i.email && !ja ? "cursor-pointer" : "opacity-60")}>
                    <input type="checkbox" className="mt-0.5" disabled={!i.email || ja} checked={ja || (!!i.email && !fora.has(i.email))}
                      onChange={(e) => setFora((antes) => { const novo = new Set(antes); if (e.target.checked) novo.delete(i.email); else novo.add(i.email); return novo; })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--color-text-primary)]">{i.empresa}</span>
                      <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{i.email || (i.procurando ? "procurando e-mail…" : "sem e-mail publicado")}{ja && " · já está na lista"}{i.detalhe && ` · ${i.detalhe}`}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {mais && <Button type="button" variant="outline" onClick={() => void buscar(mais, true)} disabled={carregando} className="h-9 px-3 text-xs font-bold mr-2">Trazer as próximas empresas</Button>}
          <Button type="button" onClick={adicionar} disabled={!escolhidos.length} className="h-9 px-4 text-xs font-bold">Adicionar {escolhidos.length || ""} à campanha</Button>
        </>
      )}
      <p className="text-[11px] text-[var(--color-text-faint)]">Essas empresas não pediram para receber. Mande poucas por vez, com assunto claro: muito e-mail frio prejudica a entrega do seu domínio. Todo envio leva o link para sair da lista.</p>
    </div>
  );
}
