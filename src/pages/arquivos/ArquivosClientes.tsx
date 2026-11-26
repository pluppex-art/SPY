import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2, CalendarDays, Copy, Download, Eye, File as FileIcon, FileSpreadsheet, FileText, FolderOpen, HardDrive, Image,
  Layers, Link2, Loader2, Share2, Trash2, Upload, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { AbasPagina } from "../../components/ui/abas-pagina";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { ModalTitle, inputCls, selectCls } from "../finance/components/ModalKit";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import {
  BUCKET_ARQUIVOS, CATEGORIAS, VALIDADE_LINK_DIAS, abreNoNavegador, chaveDoArquivo, motivoRecusa, nomeExibido,
  pastaDaCategoria, tamanhoLegivel, type ArquivoCliente, type CategoriaArquivo,
} from "../../lib/arquivosCliente";

const armazenamento = () => supabase!.storage.from(BUCKET_ARQUIVOS);

function iconeDe(nome: string) {
  if (/\.(png|jpe?g|webp|gif|psd|ai|heic)$/i.test(nome)) return Image;
  if (/\.(mp4|mov|webm|avi)$/i.test(nome)) return Video;
  if (/\.(xlsx?|csv|ods)$/i.test(nome)) return FileSpreadsheet;
  if (/\.(pdf|docx?|txt|odt|pptx?)$/i.test(nome)) return FileText;
  return FileIcon;
}

async function listarCategoria(tenantId: string, clienteId: string, categoria: CategoriaArquivo): Promise<ArquivoCliente[]> {
  const pasta = pastaDaCategoria(tenantId, clienteId, categoria);
  const achados: ArquivoCliente[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await armazenamento().list(pasta, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const o of data ?? []) {
      if (!o.id || o.name.startsWith(".")) continue; // subpastas e marcador de pasta vazia
      achados.push({
        caminho: `${pasta}/${o.name}`, nome: nomeExibido(o.name), categoria,
        tamanho: Number((o.metadata as any)?.size) || 0, tipo: String((o.metadata as any)?.mimetype || ""), criadoEm: o.created_at || "",
      });
    }
    if ((data?.length ?? 0) < 1000) return achados;
  }
}

/** Banco de arquivos de cada cliente atendido (agência, contabilidade, BPO). */
export default function ArquivosClientes() {
  const { empresaFiliais } = useData() as any;
  const { activeTenantId, activeFilialId } = useAuth();
  const [params, setParams] = useSearchParams();

  const clientes = useMemo(
    () => (empresaFiliais as any[]).filter((f) => f.status === "Cliente").map((f) => ({ id: String(f.id), nome: String(f.nome) })).sort((a, b) => a.nome.localeCompare(b.nome)),
    [empresaFiliais],
  );
  const clienteDoMenu = clientes.some((c) => c.id === activeFilialId) ? (activeFilialId as string) : "";
  const daUrl = params.get("cliente") || "";
  const clienteId = clienteDoMenu || (clientes.some((c) => c.id === daUrl) ? daUrl : clientes.length === 1 ? clientes[0].id : "");
  const cliente = clientes.find((c) => c.id === clienteId);
  const escolher = (id: string) => setParams(id ? { cliente: id } : {}, { replace: true });

  const [arquivos, setArquivos] = useState<ArquivoCliente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [falha, setFalha] = useState("");
  const [aba, setAba] = useState<"todas" | CategoriaArquivo>("todas");
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState<CategoriaArquivo>("documentos");
  const [enviando, setEnviando] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [compartilhar, setCompartilhar] = useState<{ nome: string; url: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    if (!supabase || !activeTenantId || !clienteId) { setArquivos([]); setCarregando(false); return; }
    setCarregando(true);
    setFalha("");
    try {
      const listas = await Promise.all(CATEGORIAS.map((c) => listarCategoria(activeTenantId, clienteId, c.id)));
      if (meu !== pedido.current) return; // trocou de cliente no meio do caminho
      setArquivos(listas.flat().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
    } catch (e: any) {
      if (meu === pedido.current) { setArquivos([]); setFalha(friendlyError(e)); }
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [activeTenantId, clienteId]);

  useEffect(() => { setArquivos([]); setBusca(""); void carregar(); }, [carregar]);
  // Envio e troca de categoria demoram: ao terminar, recarrega o cliente que está na tela agora, não o do começo.
  const atual = useRef(carregar);
  atual.current = carregar;

  const enviar = async (lista: File[]) => {
    if (!supabase || !activeTenantId || !clienteId || !lista.length || enviando) return;
    const categoria = aba === "todas" ? destino : aba;
    let ok = 0;
    try {
      for (const [i, arquivo] of lista.entries()) {
        const motivo = motivoRecusa(arquivo);
        if (motivo) { toast.error(`"${arquivo.name}": ${motivo}.`); continue; }
        setEnviando(`Enviando ${i + 1} de ${lista.length}…`);
        const caminho = `${pastaDaCategoria(activeTenantId, clienteId, categoria)}/${chaveDoArquivo(arquivo.name, Date.now() + i)}`;
        const { error } = await armazenamento().upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || "application/octet-stream" });
        if (error) { toast.error(`"${arquivo.name}" não foi enviado: ${friendlyError(error)}`); continue; }
        ok++;
      }
      if (ok) toast.success(`${ok} ${ok === 1 ? "arquivo enviado" : "arquivos enviados"} para ${cliente?.nome}.`);
    } finally {
      setEnviando("");
      if (entrada.current) entrada.current.value = "";
      await atual.current();
    }
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    void enviar(Array.from(e.dataTransfer.files));
  };

  const linkTemporario = async (a: ArquivoCliente, segundos: number, baixar: boolean) => {
    const { data, error } = await armazenamento().createSignedUrl(a.caminho, segundos);
    if (error || !data?.signedUrl) { toast.error(`Não foi possível gerar o link: ${friendlyError(error)}`); return null; }
    // O nome do download é acrescentado aqui: a opção da biblioteca codifica duas vezes (parênteses viravam %28).
    return baixar ? `${data.signedUrl}&download=${encodeURIComponent(a.nome)}` : data.signedUrl;
  };

  const abrir = async (a: ArquivoCliente) => {
    // A aba é aberta já no clique; depois do await o navegador a bloquearia.
    const janela = window.open("", "_blank");
    if (janela) janela.opener = null;
    const url = await linkTemporario(a, 300, false);
    if (!url) { janela?.close(); return; }
    if (janela) janela.location.href = url; else toast.error("O navegador bloqueou a nova aba. Use Baixar.");
  };

  const baixar = async (a: ArquivoCliente) => {
    const url = await linkTemporario(a, 300, true);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const gerarCompartilhamento = async (a: ArquivoCliente) => {
    const url = await linkTemporario(a, VALIDADE_LINK_DIAS * 86400, true);
    if (url) setCompartilhar({ nome: a.nome, url });
  };

  const mover = async (a: ArquivoCliente, categoria: CategoriaArquivo) => {
    if (!activeTenantId || categoria === a.categoria) return;
    const novo = `${pastaDaCategoria(activeTenantId, clienteId, categoria)}/${a.caminho.split("/").pop()}`;
    const { error } = await armazenamento().move(a.caminho, novo);
    if (error) { toast.error(`Não foi possível mover: ${friendlyError(error)}`); return; }
    toast.success(`"${a.nome}" movido para ${CATEGORIAS.find((c) => c.id === categoria)?.nome}.`);
    await atual.current();
  };

  const excluir = async (a: ArquivoCliente) => {
    if (!(await confirmDialog({ title: "Excluir arquivo", description: `Excluir "${a.nome}"? Essa ação não pode ser desfeita e os links enviados deixam de funcionar.` }))) return;
    const { data, error } = await armazenamento().remove([a.caminho]);
    // Sem permissão, o armazenamento responde sem erro e sem apagar nada.
    if (error || !data?.length) { toast.error(error ? `Não foi possível excluir: ${friendlyError(error)}` : "O arquivo não foi excluído. Confira seu acesso."); return; }
    setArquivos((l) => l.filter((x) => x.caminho !== a.caminho));
    toast.success("Arquivo excluído.");
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return arquivos.filter((a) => (aba === "todas" || a.categoria === aba) && (!q || a.nome.toLowerCase().includes(q)));
  }, [arquivos, aba, busca]);

  const mesAtual = new Date().toISOString().slice(0, 7);

  if (!clientes.length) {
    return (
      <PageContainer title="Arquivos de Clientes" subtitle="Documentos, contratos e materiais de cada cliente atendido.">
        <Card className="p-12 flex flex-col items-center text-center gap-3">
          <Users className="w-8 h-8 text-[var(--color-text-muted)]" />
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum cliente cadastrado ainda.</p>
          <p className="text-xs text-[var(--color-text-muted)]">Cadastre os clientes que você atende para guardar os arquivos de cada um.</p>
          <Link to="/app/configuracoes/empresa/filiais" className="text-xs font-bold text-[var(--color-primary-blue)]">Cadastrar cliente</Link>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Arquivos de Clientes"
      subtitle={cliente ? `Documentos, contratos e materiais de ${cliente.nome}.` : "Escolha um cliente para ver os arquivos dele."}
    >
      {!cliente ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => (
            <button key={c.id} type="button" onClick={() => escolher(c.id)} className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-left cursor-pointer hover:border-[var(--color-primary-blue)] transition-colors">
              <span className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] grid place-items-center shrink-0"><Building2 className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-text-primary)]">{c.nome}</span>
              <FolderOpen className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <KpiFilterCard
            id="arquivosClientes"
            kpis={[
              { label: "Arquivos", value: arquivos.length, icon: FileText, tone: "primary" },
              { label: "Espaço usado", value: tamanhoLegivel(arquivos.reduce((s, a) => s + a.tamanho, 0)), icon: HardDrive, tone: "info" },
              { label: "Enviados neste mês", value: arquivos.filter((a) => a.criadoEm.startsWith(mesAtual)).length, icon: CalendarDays, tone: "success" },
              { label: "Categorias em uso", value: new Set(arquivos.map((a) => a.categoria)).size, icon: Layers, tone: "accent" },
            ]}
            activeCount={busca.trim() ? 1 : 0}
            onClear={() => setBusca("")}
          >
            <FilterBar>
              <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar pelo nome do arquivo..." />
              {!clienteDoMenu && clientes.length > 1 && (
                <FilterSelect icon={Users} value={clienteId} onChange={escolher} options={clientes.map((c) => ({ value: c.id, label: c.nome }))} allLabel="Ver todos os clientes" />
              )}
            </FilterBar>
          </KpiFilterCard>

          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
            onDrop={soltar}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 transition-colors ${arrastando ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)]"}`}
          >
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0" />
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">Arraste os arquivos aqui</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Até 25 MB cada. Ficam privados, visíveis só para a sua equipe.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aba === "todas" && (
                <select value={destino} onChange={(e) => setDestino(e.target.value as CategoriaArquivo)} className={`${selectCls()} !w-44`} aria-label="Categoria dos arquivos enviados">
                  {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}
              <input ref={entrada} type="file" multiple className="hidden" onChange={(e) => void enviar(Array.from(e.target.files ?? []))} />
              <Button onClick={() => entrada.current?.click()} disabled={!!enviando} className="h-9 px-4 text-xs font-bold gap-1.5 shrink-0">
                {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {enviando || "Enviar arquivos"}
              </Button>
            </div>
          </div>

          <AbasPagina<"todas" | CategoriaArquivo>
            value={aba}
            onChange={setAba}
            ariaLabel="Categorias de arquivos"
            abas={[
              { id: "todas", label: "Todos", badge: arquivos.length },
              ...CATEGORIAS.map((c) => ({ id: c.id, label: c.nome, badge: arquivos.filter((a) => a.categoria === c.id).length })),
            ]}
          />

          <Card className="overflow-hidden">
            {carregando && !arquivos.length ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" aria-label="Carregando" /></div>
            ) : falha ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm text-[var(--color-danger)]">Não foi possível carregar os arquivos: {falha}</p>
                <Button variant="outline" onClick={() => void carregar()} className="h-8 text-xs">Tentar de novo</Button>
              </div>
            ) : !filtrados.length ? (
              <p className="p-10 text-center text-sm text-[var(--color-text-muted)]">{arquivos.length ? "Nenhum arquivo encontrado nesse filtro." : "Nenhum arquivo deste cliente ainda."}</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {filtrados.map((a) => {
                  const Icone = iconeDe(a.nome);
                  return (
                    <li key={a.caminho} className="flex flex-col md:flex-row md:items-center gap-3 p-3.5">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-9 h-9 rounded-lg bg-[var(--color-surface-sunken)] grid place-items-center text-[var(--color-text-muted)] shrink-0"><Icone className="w-4 h-4" /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] truncate" title={a.nome}>{a.nome}</p>
                          <p className="text-[10px] text-[var(--color-text-faint)]">{tamanhoLegivel(a.tamanho)}{a.criadoEm ? ` · ${new Date(a.criadoEm).toLocaleDateString("pt-BR")}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <select value={a.categoria} onChange={(e) => void mover(a, e.target.value as CategoriaArquivo)} className={`${selectCls()} !w-40 !h-8`} aria-label={`Categoria de ${a.nome}`}>
                          {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        {abreNoNavegador(a.nome) && <Button variant="ghost" size="xs" className="h-8 w-8 p-0" title="Abrir" aria-label={`Abrir ${a.nome}`} onClick={() => void abrir(a)}><Eye className="w-3.5 h-3.5" /></Button>}
                        <Button variant="ghost" size="xs" className="h-8 w-8 p-0" title="Baixar" aria-label={`Baixar ${a.nome}`} onClick={() => void baixar(a)}><Download className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="xs" className="h-8 w-8 p-0" title="Compartilhar por link" aria-label={`Compartilhar ${a.nome}`} onClick={() => void gerarCompartilhamento(a)}><Link2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="xs" className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10" title="Excluir" aria-label={`Excluir ${a.nome}`} onClick={() => void excluir(a)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Modal
        isOpen={!!compartilhar}
        onClose={() => setCompartilhar(null)}
        maxWidth="max-w-lg"
        title={<ModalTitle icon={Link2} title="Link do arquivo" subtitle={`Quem tiver o link baixa o arquivo por ${VALIDADE_LINK_DIAS} dias, sem login.`} />}
      >
        {compartilhar && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[var(--color-text-primary)] break-words">{compartilhar.nome}</p>
            <input readOnly value={compartilhar.url} onFocus={(e) => e.currentTarget.select()} className={inputCls()} aria-label="Link do arquivo" />
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-9 px-4 text-xs font-bold gap-1.5"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(compartilhar.url); toast.success("Link copiado."); }
                  catch { toast.error("Não foi possível copiar. Selecione o link e copie manualmente."); }
                }}
              >
                <Copy className="w-3.5 h-3.5" /> Copiar link
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${compartilhar.nome}: ${compartilhar.url}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] no-underline hover:bg-[var(--color-surface-sunken)]"
              >
                <Share2 className="w-3.5 h-3.5" /> Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
