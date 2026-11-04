import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

const EMOJI_API_KEY = "657255bdcd2f61cce519f342e9b172e57cf25bca";
const EMOJI_API_BASE = "https://emoji-api.com";

const STICKERS = [
  { emoji: "😂", label: "Kkkk" }, { emoji: "🔥", label: "Fire" },
  { emoji: "💯", label: "100%" }, { emoji: "🚀", label: "Go!" },
  { emoji: "👀", label: "Eita" }, { emoji: "🤝", label: "Fechou" },
  { emoji: "✅", label: "Ok" },   { emoji: "❌", label: "Não" },
  { emoji: "😎", label: "Top" },  { emoji: "🥳", label: "Partiu" },
  { emoji: "💪", label: "Força" },{ emoji: "🙏", label: "Vlw" },
  { emoji: "😴", label: "ZZZ" },  { emoji: "🤯", label: "Mind" },
  { emoji: "👏", label: "Palmas" },{ emoji: "🎯", label: "Isso!" },
  { emoji: "⚡", label: "Rápido" },{ emoji: "🧠", label: "Genial" },
  { emoji: "👑", label: "Rei" },  { emoji: "🌟", label: "Estrela" },
  { emoji: "😤", label: "Vamos" },{ emoji: "🤫", label: "Segredo" },
  { emoji: "🫡", label: "Sim sr" },{ emoji: "💀", label: "Morto" },
];

const CAT_LABELS: Record<string, string> = {
  "smileys-emotion": "😀",
  "people-body": "👋",
  "animals-nature": "🐶",
  "food-drink": "🍕",
  "travel-places": "🚗",
  "activities": "⚽",
  "objects": "💡",
  "symbols": "❤️",
  "flags": "🏳️",
};

const CAT_NAMES: Record<string, string> = {
  "smileys-emotion": "Rostos",
  "people-body": "Pessoas",
  "animals-nature": "Animais",
  "food-drink": "Comida",
  "travel-places": "Viagem",
  "activities": "Atividades",
  "objects": "Objetos",
  "symbols": "Símbolos",
  "flags": "Bandeiras",
};

interface EmojiEntry {
  slug: string;
  character: string;
  unicodeName: string;
}

interface Category {
  slug: string;
  subCategories?: Category[];
}

interface Props {
  onEmojiSelect: (emoji: string) => void;
  onStickerSend: (sticker: string) => void;
  onClose: () => void;
}

const emojiCache: Record<string, EmojiEntry[]> = {};

export function EmojiStickerPicker({ onEmojiSelect, onStickerSend, onClose }: Props) {
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>("");
  const [emojis, setEmojis] = useState<EmojiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load categories on mount
  useEffect(() => {
    fetch(`${EMOJI_API_BASE}/categories?access_key=${EMOJI_API_KEY}`)
      .then(r => r.json())
      .then((data: Category[]) => {
        if (Array.isArray(data)) {
          setCategories(data);
          if (data[0]) setActiveSlug(data[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  // Load emojis when category changes
  const loadCategory = useCallback(async (slug: string) => {
    if (emojiCache[slug]) { setEmojis(emojiCache[slug]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${EMOJI_API_BASE}/categories/${slug}?access_key=${EMOJI_API_KEY}`);
      const data: EmojiEntry[] = await res.json();
      if (Array.isArray(data)) {
        emojiCache[slug] = data;
        setEmojis(data);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeSlug) loadCategory(activeSlug);
  }, [activeSlug, loadCategory]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-[min(340px,calc(100vw-1.5rem))] bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
    >
      {/* Mode tabs */}
      <div className="flex items-center border-b border-white/5 px-3 pt-2 gap-1">
        <button
          onClick={() => setTab("emoji")}
          className={`px-4 py-1.5 text-[12px] font-bold rounded-t-xl transition-all ${tab === "emoji" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          😀 Emojis
        </button>
        <button
          onClick={() => setTab("sticker")}
          className={`px-4 py-1.5 text-[12px] font-bold rounded-t-xl transition-all ${tab === "sticker" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          🎭 Figurinhas
        </button>
      </div>

      {tab === "emoji" ? (
        <>
          {/* Category bar */}
          <div className="flex items-center gap-0.5 px-2 py-2 border-b border-white/5 overflow-x-auto scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat.slug}
                onClick={() => setActiveSlug(cat.slug)}
                title={CAT_NAMES[cat.slug] || cat.slug}
                className={`text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all ${activeSlug === cat.slug ? "bg-white/15" : "hover:bg-white/8"}`}
              >
                {CAT_LABELS[cat.slug] || "🔸"}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="h-[220px] overflow-y-auto scrollbar-none p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-0">
                {emojis.map((e, i) => (
                  <button
                    key={i}
                    title={e.unicodeName}
                    onClick={() => { onEmojiSelect(e.character); onClose(); }}
                    className="text-xl p-1.5 hover:bg-white/10 rounded-lg transition-all hover:scale-125 active:scale-110"
                  >
                    {e.character}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Stickers grid */
        <div className="p-3 max-h-[300px] overflow-y-auto scrollbar-none">
          <div className="grid grid-cols-4 gap-2">
            {STICKERS.map((s, i) => (
              <button
                key={i}
                onClick={() => { onStickerSend(s.emoji); onClose(); }}
                className="flex flex-col items-center gap-1 p-3 bg-white/[0.03] hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                <span className="text-4xl leading-none">{s.emoji}</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
