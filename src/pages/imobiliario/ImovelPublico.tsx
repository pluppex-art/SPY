import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, MapPin, Bed, Bath, Car, Home, MessageCircle, Phone, Mail, ChevronLeft, Eye } from "lucide-react";
import { fetchPublicImovel, PublicImovel } from "../../lib/publicImovel";

const statusColor = (s: string) => {
  if (s === "Disponível") return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
  if (s === "Vendido") return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
  if (s === "Locado") return "bg-violet-500/20 text-violet-400 border border-violet-500/30";
  return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
};

const tipoGradient = (tipo: string) => {
  const map: Record<string, string> = {
    Apartamento: "from-blue-900/40 to-blue-800/10",
    Casa: "from-emerald-900/40 to-emerald-800/10",
    Cobertura: "from-violet-900/40 to-violet-800/10",
    Comercial: "from-amber-900/40 to-amber-800/10",
    Kitnet: "from-cyan-900/40 to-cyan-800/10",
    Terreno: "from-orange-900/40 to-orange-800/10",
  };
  return map[tipo] ?? "from-slate-900/40 to-slate-800/10";
};

function formatValor(operacao: string, valor: number) {
  if (operacao === "Locação") return `R$ ${valor.toLocaleString("pt-BR")}/mês`;
  if (valor >= 1000000) return `R$ ${(valor / 1000000).toFixed(1).replace(".", ",")}M`;
  return `R$ ${(valor / 1000).toFixed(0)}k`;
}

export default function ImovelPublico() {
  const { id } = useParams<{ id: string }>();
  const [imovel, setImovel] = useState<PublicImovel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicImovel(id || "").then((data) => {
      if (!cancelled) {
        setImovel(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
          <p className="font-bold">Carregando imóvel...</p>
        </div>
      </div>
    );
  }

  if (!imovel) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Imóvel não encontrado</h1>
          <p className="text-slate-500">O link que você acessou pode estar desatualizado.</p>
        </div>
      </div>
    );
  }

  const phoneRaw = (imovel.corretorTelefone || "").replace(/\D/g, "");
  const whatsappLink = `https://wa.me/55${phoneRaw}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel "${imovel.titulo}". Pode me passar mais informações?`)}`;

  return (
    <div className="min-h-dvh bg-[var(--color-surface)] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <a href="/" className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors mb-6 w-fit">
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar ao site
        </a>

        <div className={`h-56 rounded-2xl bg-gradient-to-br ${tipoGradient(imovel.tipo)} flex items-center justify-center relative overflow-hidden mb-6`}>
          <Building2 className="w-16 h-16 text-white/10" />
          <div className="absolute top-4 left-4 flex gap-2">
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor(imovel.status)}`}>{imovel.status}</span>
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-black/40 text-slate-300">{imovel.tipo}</span>
            {imovel.operacao === "Locação" && <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-violet-500/30 text-violet-300">Locação</span>}
          </div>
        </div>

        <h1 className="text-2xl font-black text-white mb-1">{imovel.titulo}</h1>
        <p className="text-sm text-slate-400 flex items-center gap-1 mb-4">
          <MapPin className="w-3.5 h-3.5" />{imovel.bairro}, {imovel.cidade}
        </p>

        <div className="flex items-center justify-between border-y border-white/5 py-4 mb-6">
          <div>
            <p className="text-3xl font-black text-white">{formatValor(imovel.operacao, imovel.valor)}</p>
            <p className="text-[11px] text-slate-500">{imovel.operacao}</p>
          </div>
          <div className="text-right flex items-center gap-1.5 text-slate-500">
            <Eye className="w-3.5 h-3.5" />
            <span className="text-xs">Anúncio verificado</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
            <Home className="w-4 h-4 text-slate-500" />
            <div><p className="text-[9px] text-slate-500">Área</p><p className="text-sm font-bold text-white">{imovel.area} m²</p></div>
          </div>
          {imovel.quartos > 0 && (
            <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
              <Bed className="w-4 h-4 text-slate-500" />
              <div><p className="text-[9px] text-slate-500">Quartos</p><p className="text-sm font-bold text-white">{imovel.quartos}</p></div>
            </div>
          )}
          {imovel.banheiros > 0 && (
            <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
              <Bath className="w-4 h-4 text-slate-500" />
              <div><p className="text-[9px] text-slate-500">Banheiros</p><p className="text-sm font-bold text-white">{imovel.banheiros}</p></div>
            </div>
          )}
          {imovel.vagas > 0 && (
            <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
              <Car className="w-4 h-4 text-slate-500" />
              <div><p className="text-[9px] text-slate-500">Vagas</p><p className="text-sm font-bold text-white">{imovel.vagas}</p></div>
            </div>
          )}
        </div>

        {imovel.descricao && (
          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Descrição</p>
            <p className="text-sm text-slate-300 leading-relaxed">{imovel.descricao}</p>
          </div>
        )}

        {imovel.corretorNome && (
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                {imovel.corretorNome.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{imovel.corretorNome}</p>
                <p className="text-[11px] text-slate-500">{imovel.corretorCreci || "Corretor responsável"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {phoneRaw && (
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all text-[11px]">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
              )}
              {imovel.corretorTelefone && (
                <a href={`tel:${imovel.corretorTelefone}`} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 text-[11px]">
                  <Phone className="w-3.5 h-3.5" /> Ligar
                </a>
              )}
              {imovel.corretorEmail && (
                <a href={`mailto:${imovel.corretorEmail}`} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 text-[11px]">
                  <Mail className="w-3.5 h-3.5" /> E-mail
                </a>
              )}
            </div>
          </div>
        )}

        {imovel.corretorSlug && (
          <a href={`/corretor/${imovel.corretorSlug}`} className="block text-center text-[11px] text-slate-600 hover:text-slate-400 transition-colors mt-6">
            Ver todos os imóveis deste corretor →
          </a>
        )}

        <footer className="text-center text-[11px] text-slate-600 mt-10 pt-6 border-t border-white/5">
          Anúncio gerado por <span className="text-blue-500 font-bold">S.P.Y. CRM</span>
        </footer>
      </div>
    </div>
  );
}
