import { useState, useEffect, useRef } from "react";
import { AI_OUTSIDE_AURORA_ENABLED } from "../../../lib/featureFlags";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/apiClient";
import { blobParaBase64, type MidiaParaEnviar } from "../../../lib/chatMedia";

export type Channel = "WhatsApp" | "Instagram" | "Email";

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  channel: Channel;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  phone?: string;
  email?: string;
  /** Instância (número) de WhatsApp da conversa — define a IA que atende. */
  instanceId?: string | null;
  tags?: string[];
  slaStatus?: string;
  purchaseHistory?: { item: string; date: string; value: string; }[];
}

export interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  time: string;
  status?: "sent" | "read";
}

export type RightPanelState = "none" | "info" | "ai";


const playIncomingMessageSound = (soundEnabled: boolean) => {
  if (!soundEnabled) return;

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    oscillator.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
  } catch(e) {
    console.warn("AudioContext init failed", e);
  }
};

/** Mensagens da conversa: o que o servidor devolveu + as que acabei de enviar e ainda não chegaram (otimistas). */
function mesclarMensagens(atuais: Message[] | undefined, servidor: Message[]): Message[] {
  const agora = Date.now();
  const pendentes = (atuais || []).filter(
    (m) =>
      m.id.startsWith("opt-") &&
      agora - Number(m.id.slice(4)) < 20000 &&
      !servidor.some((x) => x.sender === "me" && x.text === m.text),
  );
  const proxima = pendentes.length ? [...servidor, ...pendentes] : servidor;
  // Nada mudou (mesmo tamanho, mesmo último id e texto): devolve o mesmo array e a tela não é redesenhada.
  if (atuais && atuais.length === proxima.length) {
    const a = atuais[atuais.length - 1];
    const b = proxima[proxima.length - 1];
    if (!a || !b || (a.id === b.id && a.text === b.text && a.status === b.status)) return atuais;
  }
  return proxima;
}

/** Assinatura leve da lista de conversas: só redesenha quando algo visível mudou. */
const assinaturaContatos = (lista: Contact[]) =>
  lista.map((c) => `${c.id}|${c.unread}|${c.lastMessage}|${c.time}|${c.name}|${c.online ? 1 : 0}`).join("\n");

export function useMessaging() {
  const { leads, leadActivities, addLeadActivity } = useData();
  const { user, activeTenantId } = useAuth();
  // Todas as chamadas do WhatsApp levam a empresa ATIVA (master/parceiro podem alternar entre empresas).
  const q = activeTenantId ? `?tenantId=${encodeURIComponent(activeTenantId)}` : "";
  const soundEnabled = user?.preferences?.whatsappSound !== false;

  const parseMessageTimeToTimestamp = (timeStr: string): number => {
    const now = new Date();
    if (timeStr === "Ontem") {
      return now.getTime() - 24 * 3600 * 1000;
    }
    if (["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].includes(timeStr)) {
      return now.getTime() - 3 * 24 * 3600 * 1000;
    }
    const parts = timeStr.split(":");
    if (parts.length === 2) {
      const h = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      return d.getTime();
    }
    return now.getTime();
  };

  const parseActivityDateToTimestamp = (dateStr: string): number => {
    const now = new Date();
    if (dateStr.startsWith("Hoje")) {
      const timePart = dateStr.split(",")[1]?.trim() || "12:00";
      const [h, m] = timePart.split(":").map(Number);
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      return d.getTime();
    }
    if (dateStr.startsWith("Ontem")) {
      const timePart = dateStr.split(",")[1]?.trim() || "12:00";
      const [h, m] = timePart.split(":").map(Number);
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, m);
      return d.getTime();
    }
    const match = dateStr.match(/(\d+)\s+(\w+),\s*(\d+):(\d+)/);
    if (match) {
      const day = parseInt(match[1]);
      const monthStr = match[2];
      const hour = parseInt(match[3]);
      const minute = parseInt(match[4]);
      
      const months: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mai': 4, 'Jun': 5,
        'Jul': 6, 'Ago': 7, 'Set': 8, 'Out': 9, 'Nov': 10, 'Dez': 11,
        'Mgo': 7
      };
      const month = months[monthStr] || now.getMonth();
      const d = new Date(now.getFullYear(), month, day, hour, minute);
      return d.getTime();
    }
    return now.getTime() - 12 * 3600 * 1000;
  };

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("axis_activeTab") || "Todas";
    }
    return "Todas";
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("axis_searchQuery") || "";
    }
    return "";
  });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("axis_activeTab", activeTab);
      window.sessionStorage.setItem("axis_searchQuery", searchQuery);
    }
  }, [searchQuery, activeTab]);

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [previousChat, setPreviousChat] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanelState>("none");
  const [previousPanel, setPreviousPanel] = useState<RightPanelState>("info");
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (leads.length > 0 && contacts.length === 0) {
      setContacts(leads.map(l => ({
        id: l.id,
        name: l.name,
        avatar: l.name.substring(0, 2).toUpperCase(),
        channel: "WhatsApp",
        lastMessage: "Inicie o atendimento",
        time: "Agora",
        unread: 0,
        online: false,
        phone: l.phone,
        email: l.email,
        tags: l.status ? [l.status.toLowerCase()] : [],
        slaStatus: "Sem histórico de chat"
      })));
    }
  }, [leads, contacts.length]);
  const [inputText, setInputText] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  
  const [sentiment, setSentiment] = useState<string>("");
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiSuggestion, setAiSuggestion] = useState<string>("");

  const [viewMode, setViewMode] = useState<"chat" | "unified">("chat");

  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [newActivityType, setNewActivityType] = useState<'Ligação' | 'E-mail' | 'Reunião' | 'Outro'>('Reunião');
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityDesc, setNewActivityDesc] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [aiMessages, setAiMessages] = useState<{id: string, text: string, type: 'user'|'system'}[]>([
    {id: 'sys-1', text: 'Olá! Sou a Master AI. Posso te ajudar a analisar a conversa, sugerir respostas ou verificar o histórico do cliente. Como posso ajudar agora?', type: 'system'}
  ]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 768 : false);

  const prevUnreadCountRef = useRef<number>(0);

  const fetchContacts = () => {
    apiFetch(`/api/whatsapp/contacts${q}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Lista vazia também vale: ao trocar para uma empresa sem conversas, não pode sobrar a lista da anterior.
        if (Array.isArray(data)) {
          setContacts((prev) => (assinaturaContatos(prev) === assinaturaContatos(data) ? prev : data));
          const currentUnread = data.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);
          if (currentUnread > prevUnreadCountRef.current) {
            playIncomingMessageSound(soundEnabled);
          }
          prevUnreadCountRef.current = currentUnread;
        }
        setIsOffline(false);
      })
      .catch(err => {
        console.warn("Could not fetch live contacts (backend might be offline/initializing):", err.message || err);
        setIsOffline(true);
      });
  };

  const handleManualRetry = () => {
    toast.info("Tentando reconectar...", { id: "retry-fetch" });
    apiFetch(`/api/whatsapp/contacts${q}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) {
          setContacts(data);
        }
        setIsOffline(false);
        toast.success("Conexão restabelecida!", { id: "retry-fetch" });
      })
      .catch(() => {
        setIsOffline(true);
        toast.error("Falha ao reconectar. O backend ainda está offline.", { id: "retry-fetch" });
      });

    if (activeChat) {
      apiFetch(`/api/whatsapp/messages/${activeChat}${q}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data) {
            setMessages(prev => ({ ...prev, [activeChat]: data }));
          }
          setIsOffline(false);
        })
        .catch(() => {
          setIsOffline(true);
        });
    }
  };

  // Trocou de empresa: zera conversas, mensagens e chat aberto antes de carregar as da nova empresa.
  useEffect(() => {
    setContacts([]);
    setMessages({});
    setActiveChat(null);
    prevUnreadCountRef.current = 0;
  }, [activeTenantId]);

  useEffect(() => {
    // Pausa a busca periódica com a aba oculta e atualiza na hora ao voltar.
    fetchContacts();
    const interval = setInterval(() => { if (!document.hidden) fetchContacts(); }, 10000);
    const onVisible = () => { if (!document.hidden) fetchContacts(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeTenantId]);

  useEffect(() => {
    if (!activeChat) return;
    const fetchChatMessages = () => {
      apiFetch(`/api/whatsapp/messages/${activeChat}${q}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setMessages(prev => {
              const proxima = mesclarMensagens(prev[activeChat], data);
              return proxima === prev[activeChat] ? prev : { ...prev, [activeChat]: proxima };
            });
          }
          setIsOffline(false);
        })
        .catch(err => {
          console.warn("Could not fetch live messages (backend might be offline/initializing):", err.message || err);
          setIsOffline(true);
        });
    };
    fetchChatMessages();
    const interval = setInterval(() => { if (!document.hidden) fetchChatMessages(); }, 6000);
    const onVisible = () => { if (!document.hidden) fetchChatMessages(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeChat, activeTenantId]);

  useEffect(() => {
    if (!activeChat || !AI_OUTSIDE_AURORA_ENABLED) {
      setSentiment("");
      setAiAnalysis("");
      setAiSuggestion("");
      return;
    }

    setSentiment("Analisando...");
    apiFetch("/api/whatsapp/copilot/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: activeChat })
    })
      .then(res => res.json())
      .then(data => {
        setSentiment(data.sentiment || "Neutro");
        setAiAnalysis(data.analysis || "Conversa em andamento.");
        setAiSuggestion(data.suggestion || "");
      })
      .catch(err => {
        console.warn("Could not retrieve Copilot analysis (backend might be offline/initializing):", err.message || err);
        setSentiment("Neutro");
      });
  }, [activeChat, messages[activeChat as string]?.length]);

  const handleAiAsk = () => {
    if (!aiPrompt.trim() || aiTyping) return;
    const userPrompt = aiPrompt.trim();
    setAiMessages(prev => [...prev, {id: Date.now().toString(), text: userPrompt, type: 'user'}]);
    setAiPrompt("");
    setAiTyping(true);

    setTimeout(() => {
      setAiTyping(false);
      setAiMessages(prev => [...prev, {id: Date.now().toString(), text: "Com base no contexto atual, sugiro oferecer frete grátis para acelerar a conversão. Quer que eu escreva a mensagem para você?", type: 'system'}]);
    }, 1500);
  };

  useEffect(() => {
    if (activeChat) setPreviousChat(activeChat);
  }, [activeChat]);

  useEffect(() => {
    if (rightPanel !== "none") setPreviousPanel(rightPanel);
  }, [rightPanel]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSendMessage = () => {
    if (!inputText.trim() || !activeChat) return;

    const textToSend = inputText.trim();
    setInputText("");

    const optMessage: Message = {
      id: "opt-" + Date.now().toString(),
      text: textToSend,
      sender: "me",
      status: "sent",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => ({
      ...prev,
      [activeChat]: [...(prev[activeChat] || []), optMessage]
    }));

    apiFetch("/api/whatsapp/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: activeChat, text: textToSend })
    })
    .then(async res => {
      if (!res.ok) {
        let msg = "Não foi possível enviar a mensagem";
        try {
          const body = await res.json();
          if (body && typeof body.error === "string" && body.error.trim()) msg = body.error;
          else if (body && typeof body.message === "string" && body.message.trim()) msg = body.message;
        } catch { /* corpo não-JSON: mantém a mensagem padrão */ }
        throw new Error(msg);
      }
      return res.json().catch(() => null);
    })
    .then(() => {
      apiFetch(`/api/whatsapp/messages/${activeChat}${q}`)
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data)) return;
          setMessages(prev => {
            const proxima = mesclarMensagens(prev[activeChat], data);
            return proxima === prev[activeChat] ? prev : { ...prev, [activeChat]: proxima };
          });
        })
        .catch(err => {
          console.warn("Could not reload messages after sending:", err.message || err);
        });
      fetchContacts();
    })
    .catch(err => {
      console.warn("Error sending message:", err);
      setMessages(prev => ({
        ...prev,
        [activeChat]: (prev[activeChat] || []).filter(m => m.id !== optMessage.id)
      }));
      toast.error(err instanceof Error && err.message ? err.message : "Não foi possível enviar a mensagem");
    });
  };

  /** Envia imagem, áudio, vídeo ou documento para a conversa aberta. Devolve true quando o servidor aceitou. */
  const handleSendMedia = async (m: MidiaParaEnviar, caption: string): Promise<boolean> => {
    if (!activeChat) return false;
    const chatId = activeChat;
    const legenda = caption.trim();
    const rotulo = { image: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: `📎 ${m.filename}` }[m.kind];
    const optMessage: Message = {
      id: "opt-" + Date.now().toString(),
      text: legenda ? `${rotulo}\n${legenda}` : rotulo,
      sender: "me",
      status: "sent",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => ({ ...prev, [chatId]: [...(prev[chatId] || []), optMessage] }));
    const desfazer = () => setMessages(prev => ({ ...prev, [chatId]: (prev[chatId] || []).filter(x => x.id !== optMessage.id) }));
    try {
      const data = await blobParaBase64(m.blob);
      const res = await apiFetch(`/api/whatsapp/messages/send-media${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: chatId, kind: m.kind, mimetype: m.mimetype, filename: m.filename, data, caption: legenda }),
      });
      if (!res.ok) {
        let msg = "Não foi possível enviar o arquivo";
        try { const body = await res.json(); if (typeof body?.error === "string" && body.error.trim()) msg = body.error; } catch { /* corpo não-JSON */ }
        throw new Error(msg);
      }
      apiFetch(`/api/whatsapp/messages/${chatId}${q}`)
        .then(r => r.json())
        .then(lista => {
          if (!Array.isArray(lista)) return;
          setMessages(prev => {
            const proxima = mesclarMensagens(prev[chatId], lista);
            return proxima === prev[chatId] ? prev : { ...prev, [chatId]: proxima };
          });
        })
        .catch(() => {});
      fetchContacts();
      return true;
    } catch (err) {
      desfazer();
      toast.error(err instanceof Error && err.message ? err.message : "Não foi possível enviar o arquivo");
      return false;
    }
  };

  const handleCreateActivity = (matchingLeadId: string) => {
    if (!newActivityTitle.trim() || !newActivityDesc.trim()) {
      toast.error("Preencha o título e a descrição do evento.");
      return;
    }

    addLeadActivity(
      matchingLeadId,
      newActivityType,
      newActivityTitle.trim(),
      newActivityDesc.trim(),
      user?.name?.trim() || "Usuário"
    );

    toast.success("Evento registrado com sucesso no histórico do Lead!");
    setShowAddActivityModal(false);
    setNewActivityTitle("");
    setNewActivityDesc("");
  };

  const handleChatSelect = (id: string) => {
    setActiveChat(id);
    setRightPanel("none");
  };

  return {
    leads,
    leadActivities,
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    isSearching,
    activeChat, setActiveChat,
    previousChat, setPreviousChat,
    rightPanel, setRightPanel,
    previousPanel, setPreviousPanel,
    contacts, setContacts,
    messages, setMessages,
    inputText, setInputText,
    isOffline,
    sentiment, setSentiment,
    aiAnalysis,
    aiSuggestion,
    viewMode, setViewMode,
    showAddActivityModal, setShowAddActivityModal,
    newActivityType, setNewActivityType,
    newActivityTitle, setNewActivityTitle,
    newActivityDesc, setNewActivityDesc,
    aiPrompt, setAiPrompt,
    aiTyping,
    aiMessages, setAiMessages,
    isMobile,
    parseMessageTimeToTimestamp,
    parseActivityDateToTimestamp,
    handleManualRetry,
    handleAiAsk,
    handleSendMessage,
    handleSendMedia,
    handleCreateActivity,
    handleChatSelect
  };
}
