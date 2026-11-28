"""
Corta uma narração única (um áudio por vídeo, sem pausas marcadas) em uma fala por arquivo, em voz/<vídeo>/.
Transcreve no próprio computador para achar onde cada frase do roteiro termina, e confere cada pedaço.

  uv run --python 3.12 --with faster-whisper scripts/vsl/cortar-voz.py varejo /caminho/narracao.mp3
"""
import difflib, json, re, subprocess, sys, unicodedata, wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

AQUI = Path(__file__).resolve().parent
video, audio = sys.argv[1], sys.argv[2]

# falas do roteiro (o mesmo arquivo que gera o vídeo)
js = """
const fs = require('fs'), vm = require('vm'), c = {}; c.window = c; vm.createContext(c);
for (const f of ['desenho.js', 'roteiros/' + process.argv[2] + '.js']) vm.runInContext(fs.readFileSync(process.argv[1] + '/' + f, 'utf8'), c);
console.log(JSON.stringify(c.ROTEIRO.cenas.flatMap((s) => s.falas.map((f, n) => ({ arquivo: s.id + '-' + n, texto: typeof f === 'string' ? f : f.dito || f.texto })))));
"""
falas = json.loads(subprocess.run(["node", "-e", js, str(AQUI), video], capture_output=True, check=True, text=True).stdout)


def amostras(taxa):
    bruto = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-f", "f32le", "-ac", "1", "-ar", str(taxa), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(bruto, dtype=np.float32)


NUMEROS = {"1": "um", "2": "dois", "3": "tres", "4": "quatro"}


def limpar(texto):
    t = unicodedata.normalize("NFD", texto.lower()).encode("ascii", "ignore").decode()
    t = re.sub(r"s\.p\.y\.?|\bespai\b|\bspai\b|\bspi\b", "spy", t)
    return [NUMEROS.get(p, p) for p in re.findall(r"[a-z0-9]+", t)]


modelo = WhisperModel("small", device="cpu", compute_type="int8")


def transcrever(a):
    segs, _ = modelo.transcribe(a, language="pt", word_timestamps=True, beam_size=5)
    return [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]


palavras = transcrever(amostras(16000))
roteiro = [(p, i) for i, f in enumerate(falas) for p in limpar(f["texto"])]
ouvido = [(p, j) for j, (w, _, _) in enumerate(palavras) for p in limpar(w)]
casadas = difflib.SequenceMatcher(a=[p for p, _ in roteiro], b=[p for p, _ in ouvido], autojunk=False).get_matching_blocks()
onde = [[] for _ in falas]  # índices das palavras ouvidas de cada fala
for bloco in casadas:
    for k in range(bloco.size):
        onde[roteiro[bloco.a + k][1]].append(ouvido[bloco.b + k][1])
if any(not o for o in onde):
    sys.exit("Não achei no áudio: " + "; ".join(f["texto"] for f, o in zip(falas, onde) if not o))

# silêncios do áudio, para cortar no ponto mais limpo perto de cada fim de frase
log = subprocess.run(["ffmpeg", "-i", audio, "-af", "silencedetect=noise=-35dB:d=0.08", "-f", "null", "-"], capture_output=True, text=True).stderr
silencios = list(zip(map(float, re.findall(r"silence_start: ([\d.]+)", log)), map(float, re.findall(r"silence_end: ([\d.]+)", log))))

cortes = [0.0]
for i in range(len(falas) - 1):
    de, ate = max(onde[i]), min(onde[i + 1])
    k = max(range(de, ate), key=lambda k: palavras[k + 1][1] - palavras[k][2])
    fim, ini = palavras[k][2], palavras[k + 1][1]
    perto = [s for s in silencios if s[1] > fim - 0.25 and s[0] < ini + 0.25]
    if perto:
        a, b = max(perto, key=lambda s: s[1] - s[0])
        cortes.append((a + b) / 2)
    else:
        print(f"  aviso: sem pausa clara depois de “{falas[i]['texto']}”")
        cortes.append((fim + ini) / 2)

som = amostras(48000)
cortes.append(len(som) / 48000)
destino = AQUI / "voz" / video
destino.mkdir(parents=True, exist_ok=True)
rampa = np.linspace(0, 1, 240, dtype=np.float32)
ruins = 0
for i, f in enumerate(falas):
    p = som[int(cortes[i] * 48000):int(cortes[i + 1] * 48000)].copy()
    p[:240] *= rampa
    p[-240:] *= rampa[::-1]
    arquivo = destino / f"{f['arquivo']}.wav"
    with wave.open(str(arquivo), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes((np.clip(p, -1, 1) * 32767).astype("<i2").tobytes())
    # confere o pedaço sozinho: começo e fim da frase precisam estar nele
    r16 = subprocess.run(["ffmpeg", "-v", "error", "-i", str(arquivo), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    dito = " ".join(w for w, _, _ in transcrever(np.frombuffer(r16, dtype=np.float32)))
    certo = difflib.SequenceMatcher(a=limpar(f["texto"]), b=limpar(dito), autojunk=False).ratio()
    marca = "ok " if certo >= 0.85 else "VER"
    ruins += certo < 0.85
    print(f"{marca} {len(p) / 48000:5.2f}s {f['arquivo']:15} {dito}")
print(f"{len(falas)} falas em {destino} · {ruins} para ouvir")
