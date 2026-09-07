"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audioEngine";
import { EMPTY_MIX, SCENARIOS, SOUND_LABELS } from "@/lib/scenarios";
import { mixFromPrompt } from "@/lib/promptMix";
import type { Mix, SavedPreset, SoundId } from "@/lib/types";

const SOUND_IDS = Object.keys(SOUND_LABELS) as SoundId[];

const CATEGORIES = ["Tutti", "Casa", "Meteo", "Natura", "Viaggio", "Focus"] as const;
type Category = (typeof CATEGORIES)[number];

const PROMPT_SUGGESTIONS = [
  { label: "🏔️ Baita & bufera di neve", text: "Voglio dormire in una baita mentre fuori nevica e c'è il camino a legna acceso" },
  { label: "🛁 Scaldino & phon rilassante", text: "Rumore caldo di scaldino e phon rilassante come in bagno dopo la doccia" },
  { label: "⛈️ Temporale e tuoni lontani", text: "Temporale notturno con pioggia battente, raffiche di vento e tuoni lontani" },
  { label: "🐱 Fusa del gatto al camino", text: "Gatto che fa le fusa sul letto, camino che scoppietta e pioggia fuori" },
  { label: "🚆 Treno nella notte", text: "Viaggio rilassante in treno di notte con ritmo regolare sui binari" },
  { label: "🌙 Notte estiva con grilli", text: "Notte estiva sotto le stelle con grilli che cantano e brezza tra gli alberi" },
  { label: "💧 Ruscello nel bosco", text: "Ruscello di montagna con acqua limpida tra i sassi e cinguettio nel bosco" },
];

function formatRemaining(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Home() {
  const engineRef = useRef<AudioEngine | null>(null);
  const fadeTimeout = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [sharedBanner, setSharedBanner] = useState("");
  const [starting, setStarting] = useState(false);
  const [mix, setMix] = useState<Mix>(SCENARIOS[0].mix);
  const mixRef = useRef(mix);
  mixRef.current = mix;
  const [playing, setPlaying] = useState(false);
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0].id);
  const [activeCategory, setActiveCategory] = useState<Category>("Tutti");
  const [prompt, setPrompt] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [alarmTime, setAlarmTime] = useState("07:30");
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmStatus, setAlarmStatus] = useState("Sveglia disattivata");

  // Memoria dei volumi precedenti per consentire play/pausa rapido su ogni singolo suono
  const [prevVolumes, setPrevVolumes] = useState<Record<SoundId, number>>(() => {
    const init: Record<string, number> = {};
    for (const id of SOUND_IDS) init[id] = 55;
    return init as Record<SoundId, number>;
  });

  useEffect(() => {
    // Carica eventuali preset salvati
    try {
      const stored = JSON.parse(localStorage.getItem("sleepscape-presets") || "[]");
      if (Array.isArray(stored)) {
        setPresets(
          stored
            .filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.name === "string" &&
                item.mix &&
                SOUND_IDS.every(
                  (id) =>
                    typeof item.mix[id] === "number" &&
                    Number.isFinite(item.mix[id]) &&
                    item.mix[id] >= 0 &&
                    item.mix[id] <= 100
                )
            )
            .slice(0, 10)
        );
      }
    } catch {
      setError("Impossibile leggere i mix salvati. Puoi continuare a usare il mixer.");
    }

    // Controlla se c'è un mix condiviso nell'URL
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const shared = urlParams.get("mix");
      if (shared) {
        try {
          const raw = atob(decodeURIComponent(shared));
          const decoded = JSON.parse(raw);
          if (decoded && decoded.m) {
            const incomingMix: Mix = { ...EMPTY_MIX };
            for (const id of SOUND_IDS) {
              if (typeof decoded.m[id] === "number") {
                incomingMix[id] = Math.max(0, Math.min(100, Math.round(decoded.m[id])));
              }
            }
            setMix(incomingMix);
            setActiveScenario("");
            setSharedBanner(`✨ Scenario "${decoded.n || "Condiviso"}" caricato! Clicca su Riproduci per ascoltare.`);
          }
        } catch {}
      }
    }

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      else {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            registrations
              .filter((registration) => registration.active?.scriptURL === `${location.origin}/sw.js`)
              .forEach((registration) => void registration.unregister());
          })
          .catch(() => undefined);
      }
    }

    return () => {
      if (fadeTimeout.current !== null) window.clearTimeout(fadeTimeout.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // Timer di spegnimento con fade-out progressivo
  useEffect(() => {
    if (!timerEnd) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        engineRef.current?.fadeMasterTo(0.0001, 8);
        const fadingEngine = engineRef.current;
        fadeTimeout.current = window.setTimeout(() => {
          if (engineRef.current !== fadingEngine) return;
          engineRef.current?.stop();
          engineRef.current = null;
          setPlaying(false);
        }, 8500);
        setTimerEnd(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timerEnd]);

  // Sveglia progressiva
  useEffect(() => {
    if (!alarmEnabled) return;
    const target = new Date();
    const [hours, minutes] = alarmTime.split(":").map(Number);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
    setAlarmStatus(`Sveglia attiva alle ${alarmTime}`);
    const id = window.setInterval(() => {
      if (Date.now() >= target.getTime()) {
        window.clearInterval(id);
        setAlarmEnabled(false);
        void wakeUp();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [alarmEnabled, alarmTime]);

  const activeCount = useMemo(() => Object.values(mix).filter((v) => v > 0).length, [mix]);

  const currentAmbianceName = useMemo(() => {
    if (activeScenario) {
      const found = SCENARIOS.find((s) => s.id === activeScenario);
      if (found) return `${found.emoji} ${found.name}`;
    }
    return activeCount > 0 ? "Mix personalizzato" : "Nessun suono attivo";
  }, [activeScenario, activeCount]);

  const filteredSounds = useMemo(() => {
    if (activeCategory === "Tutti") return SOUND_IDS;
    return SOUND_IDS.filter((id) => SOUND_LABELS[id].category === activeCategory);
  }, [activeCategory]);

  async function startEngineWithMix(targetMix: Mix) {
    if (starting) return;
    setError("");
    cancelSleepTimer();
    setStarting(true);
    try {
      const engine = engineRef.current ?? new AudioEngine();
      engineRef.current = engine;
      await engine.start(targetMix);
      setPlaying(true);
    } catch {
      engineRef.current?.stop();
      engineRef.current = null;
      setError("Audio non disponibile. Tocca per abilitare l'audio.");
    } finally {
      setStarting(false);
    }
  }

  async function togglePlay() {
    if (starting) return;
    setError("");
    cancelSleepTimer();
    if (!playing) {
      await startEngineWithMix(mix);
    } else {
      engineRef.current?.stop();
      engineRef.current = null;
      setPlaying(false);
      setTimerEnd(null);
    }
  }

  // Tasto play/pausa individuale per ciascun suono nel mixer
  async function toggleSingleSound(id: SoundId) {
    const currentVal = mix[id] ?? 0;
    let nextVal = 0;
    if (currentVal > 0) {
      // Muta/pausa questo specifico suono salvando il livello per il ripristino
      setPrevVolumes((prev) => ({ ...prev, [id]: currentVal }));
      nextVal = 0;
      showToast(`${SOUND_LABELS[id].label} in pausa`);
    } else {
      // Riattiva il suono al volume precedente
      nextVal = prevVolumes[id] && prevVolumes[id] > 0 ? prevVolumes[id] : 55;
      setPrevVolumes((prev) => ({ ...prev, [id]: nextVal }));
      showToast(`${SOUND_LABELS[id].label} avviato`);
    }
    const nextMix = { ...mix, [id]: nextVal };
    setMix(nextMix);
    setActiveScenario("");

    if (!playing && nextVal > 0) {
      await startEngineWithMix(nextMix);
    } else if (playing) {
      engineRef.current?.setMix(nextMix);
    }
  }

  async function updateSound(id: SoundId, value: number) {
    const next = { ...mix, [id]: value };
    setMix(next);
    setActiveScenario("");
    if (value > 0) {
      setPrevVolumes((prev) => ({ ...prev, [id]: value }));
    }
    if (!playing && value > 0) {
      await startEngineWithMix(next);
    } else if (playing) {
      engineRef.current?.setMix(next);
    }
  }

  async function applyScenario(id: string) {
    const scenario = SCENARIOS.find((item) => item.id === id);
    if (!scenario) return;
    setMix(scenario.mix);
    setActiveScenario(id);
    if (!playing) {
      await startEngineWithMix(scenario.mix);
    } else {
      engineRef.current?.setMix(scenario.mix);
    }
  }

  async function handleScenarioClick(id: string) {
    if (activeScenario === id && playing) {
      // Ferma lo scenario se era già attivo e in riproduzione
      engineRef.current?.stop();
      engineRef.current = null;
      setPlaying(false);
      setTimerEnd(null);
      showToast("Riproduzione fermata");
    } else {
      // Avvia lo scenario
      await applyScenario(id);
      const s = SCENARIOS.find((x) => x.id === id);
      showToast(`Avviato: ${s ? s.name : "Scenario"}`);
    }
  }

  async function createFromPrompt(customText?: string) {
    const val = customText ?? prompt;
    if (!val.trim()) return;
    const next = mixFromPrompt(val);
    setMix(next);
    setActiveScenario("");
    if (customText) setPrompt(customText);

    if (!playing) {
      await startEngineWithMix(next);
    } else {
      engineRef.current?.setMix(next);
    }
    showToast("Ambiente generato e avviato! 🎧");
  }

  function savePreset() {
    const name = presetName.trim() || `Mix ${presets.length + 1}`;
    const next: SavedPreset[] = [
      { id: crypto.randomUUID(), name, mix, createdAt: new Date().toISOString() },
      ...presets,
    ].slice(0, 10);
    setPresets(next);
    persistPresets(next);
    setPresetName("");
    showToast(`Scenario "${name}" salvato!`);
  }

  function deletePreset(id: string) {
    const next = presets.filter((preset) => preset.id !== id);
    setPresets(next);
    persistPresets(next);
  }

  function persistPresets(next: SavedPreset[]) {
    try {
      localStorage.setItem("sleepscape-presets", JSON.stringify(next));
    } catch {
      setError("Il browser non consente il salvataggio locale.");
    }
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(""), 3500);
  }

  async function shareCurrentMix(customName?: string, customMix?: Mix) {
    const targetMix = customMix ?? mix;
    const activeScen = SCENARIOS.find((s) => s.id === activeScenario);
    const targetName = customName || activeScen?.name || (presetName.trim() || "Il mio SleepScape");

    try {
      const payload = JSON.stringify({ n: targetName, m: targetMix });
      const encoded = encodeURIComponent(btoa(payload));
      const shareUrl = `${window.location.origin}${window.location.pathname}?mix=${encoded}`;

      if (navigator.share) {
        await navigator.share({
          title: `SleepScape - ${targetName}`,
          text: `Ascolta questo ambiente sonoro su SleepScape: ${targetName}`,
          url: shareUrl,
        });
        showToast("Condiviso con successo! 🚀");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Link dello scenario copiato negli appunti! 📋");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Impossibile generare il link di condivisione.");
      }
    }
  }

  function cancelSleepTimer() {
    if (fadeTimeout.current !== null) window.clearTimeout(fadeTimeout.current);
    fadeTimeout.current = null;
    setTimerEnd(null);
    setRemaining(0);
    engineRef.current?.fadeMasterTo(0.75, 0.2);
  }

  function startSleepTimer() {
    if (!playing || !Number.isFinite(timerMinutes) || timerMinutes < 1 || timerMinutes > 480) return;
    cancelSleepTimer();
    setRemaining(timerMinutes * 60);
    setTimerEnd(Date.now() + timerMinutes * 60_000);
    showToast(`Timer impostato: spegnimento tra ${timerMinutes} minuti`);
  }

  async function wakeUp() {
    cancelSleepTimer();
    try {
      // Transizione graduale verso la mattina: uccellini, ruscello e onde soffuse
      const morningMix: Mix = {
        ...EMPTY_MIX,
        forest: 48,
        stream: 40,
        waves: mixRef.current.waves > 0 ? 22 : 0,
        wind: 10,
      };

      let engine = engineRef.current;
      if (!engine) {
        engine = new AudioEngine();
        engineRef.current = engine;
        await engine.start(morningMix);
        setPlaying(true);
      } else {
        engine.setMix(morningMix);
      }
      engine.fadeMasterTo(0.7, 18);
      engine.playWakeChime(55);
      setMix(morningMix);
      setActiveScenario("");
      setAlarmStatus("Buongiorno! Risveglio dolce in corso ☀️");
      showToast("Risveglio dolce attivato ☀️");
    } catch {
      setError("Impossibile avviare la sveglia. Premi Avvia ambiente per abilitare l’audio.");
    }
  }

  return (
    <main className="shell">
      {/* HEADER HERO */}
      <header className="hero">
        <div>
          <span className="eyebrow">SLEEPSCAPE · AMBIENT GENERATOR</span>
          <h1>Crea il posto in cui vuoi dormire.</h1>
          <p>
            Mescola atmosfere sonore reali (dal camino innevato al caldobagno o treno notturno), programma lo spegnimento
            o risvegliati con una transizione dolce.
          </p>
        </div>
        <button
          className={`playButton ${playing ? "playing" : ""}`}
          onClick={togglePlay}
          disabled={starting}
          title={playing ? "Ferma riproduzione" : "Avvia ambiente sonoro"}
        >
          <span>{playing ? "■" : "▶"}</span>
          {playing ? "Ferma ambiente" : "Avvia ambiente"}
        </button>
      </header>

      {/* QUICK JUMP NAVIGATION BAR */}
      <nav className="navBar" aria-label="Navigazione rapida sezioni">
        <a href="#scenari" className="navLink">Scenari</a>
        <a href="#mixer" className="navLink">Mixer ({activeCount})</a>
        <a href="#crea" className="navLink">Crea il tuo posto</a>
        <a href="#timer" className="navLink">Timer & Sveglia</a>
        <a href="#salvati" className="navLink">Preferiti ({presets.length})</a>
      </nav>

      {/* BANNERS */}
      {sharedBanner && (
        <div className="banner info" role="status">
          <span>{sharedBanner}</span>
          <button className="ghost" onClick={() => setSharedBanner("")}>✕</button>
        </div>
      )}

      {toastMsg && (
        <div className="banner info" role="status">
          <span>{toastMsg}</span>
          <button className="ghost" onClick={() => setToastMsg("")}>✕</button>
        </div>
      )}

      {error && (
        <div className="banner warning" role="alert">
          <span>{error}</span>
          <button className="ghost" onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* 01. SCENARI PRONTI */}
      <section id="scenari">
        <div className="sectionTitle">
          <div>
            <span>01</span>
            <h2>Scenari pronti</h2>
          </div>
          <small>Tocca uno scenario per avviarlo o fermarlo subito</small>
        </div>
        <div className="scenarioGrid">
          {SCENARIOS.map((scenario) => {
            const isCurrent = activeScenario === scenario.id;
            const isScenarioPlaying = isCurrent && playing;
            return (
              <button
                key={scenario.id}
                className={`scenarioCard ${isCurrent ? "active" : ""}`}
                onClick={() => void handleScenarioClick(scenario.id)}
              >
                <div className="scenarioTop">
                  <span className="scenarioEmoji">{scenario.emoji}</span>
                  <span className={`scenarioPlayBadge ${isScenarioPlaying ? "playing" : ""}`}>
                    {isScenarioPlaying ? "■ Ferma" : "▶ Ascolta"}
                  </span>
                </div>
                <span className="scenarioName">{scenario.name}</span>
                <small>{scenario.description}</small>
              </button>
            );
          })}
        </div>
      </section>

      {/* 02. MIXER COMPLETO */}
      <section id="mixer" className="panel">
        <div className="sectionTitle">
          <div>
            <span>02</span>
            <h2>Mixer sonoro</h2>
          </div>
          <div className="btnActionGroup">
            <button
              className="btnAction share"
              onClick={() => void shareCurrentMix()}
              title="Condividi questo mix"
            >
              <span>🔗</span> Condividi
            </button>
            <button
              className="btnAction reset"
              onClick={() => {
                setMix({ ...EMPTY_MIX });
                setActiveScenario("");
                engineRef.current?.setMix(EMPTY_MIX);
                showToast("Mixer azzerato");
              }}
              title="Azzera tutti i suoni"
            >
              Azzera
            </button>
          </div>
        </div>

        {/* Categorie filtri */}
        <div className="filterRow">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`filterBtn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Canali del mixer con pulsante Play/Pausa individuale per ogni suono */}
        <div className="mixerGrid">
          {filteredSounds.map((id) => {
            const val = mix[id] ?? 0;
            const isAudioActive = val > 0;
            const isSoundAudible = isAudioActive && playing;
            return (
              <div className={`soundControl ${isAudioActive ? "activeSound" : ""}`} key={id}>
                <div className="soundControlHeader">
                  <div className="soundControlTitle">
                    <button
                      type="button"
                      className={`soundToggleBtn ${isSoundAudible ? "active" : ""}`}
                      onClick={() => void toggleSingleSound(id)}
                      title={isSoundAudible ? `Ferma ${SOUND_LABELS[id].label}` : `Avvia ${SOUND_LABELS[id].label}`}
                    >
                      <span>{isSoundAudible ? "■" : "▶"}</span>
                    </button>
                    <b>
                      {SOUND_LABELS[id].emoji} {SOUND_LABELS[id].label}
                    </b>
                  </div>
                  <output>{val}%</output>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={val}
                  onChange={(e) => void updateSound(id, Number(e.target.value))}
                  aria-label={SOUND_LABELS[id].label}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* 03. CREA DA DESCRIZIONE + TIMER & SVEGLIA */}
      <section id="crea" className="twoColumns">
        {/* Generatore testuale */}
        <div className="panel promptPanel">
          <div className="sectionTitle">
            <div>
              <span>03</span>
              <h2>Crea il tuo posto</h2>
            </div>
          </div>
          <p>Scrivi l'ambiente che immagini o tocca una delle idee: l'app configurerà e avvierà subito l'audio.</p>

          {/* Idee rapide da cliccare */}
          <div className="promptChips">
            {PROMPT_SUGGESTIONS.map((sug, i) => (
              <button key={i} className="chip" onClick={() => void createFromPrompt(sug.text)}>
                {sug.label}
              </button>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Es. voglio dormire in una baita mentre fuori nevica forte e c'è il camino a legna acceso..."
          />
          <button className="primary" onClick={() => void createFromPrompt()} disabled={!prompt.trim()}>
            Genera ambiente sonoro
          </button>
        </div>

        {/* Timer e Sveglia dolce */}
        <div id="timer" className="panel">
          <div className="sectionTitle">
            <div>
              <span>04</span>
              <h2>Timer & Sveglia dolce</h2>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <p style={{ marginTop: 0 }}>
              <b>Timer spegnimento:</b> fade-out graduale prima di fermare l'audio.
            </p>
            <div className="inlineControl">
              <input
                type="number"
                min="1"
                max="480"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Number(e.target.value))}
              />
              <span className="switchLabel">minuti</span>
              <button className="primary" onClick={startSleepTimer} disabled={!playing}>
                Avvia timer
              </button>
              {timerEnd && (
                <button className="ghost" onClick={cancelSleepTimer}>
                  Annulla
                </button>
              )}
            </div>
            {timerEnd && <div className="countdown live">{formatRemaining(remaining)}</div>}
          </div>

          <hr style={{ border: "0", borderTop: "1px solid var(--line)", margin: "20px 0" }} />

          <div>
            <p style={{ marginTop: 0 }}>
              <b>Sveglia progressiva:</b> trasforma i suoni della notte in bosco, ruscello e rintocchi armonici crescenti.
            </p>
            <div className="inlineControl">
              <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} />
              <button
                className={alarmEnabled ? "primary" : "ghost"}
                onClick={() => setAlarmEnabled((prev) => !prev)}
              >
                {alarmEnabled ? "Disattiva sveglia" : "Attiva sveglia"}
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--accent2)", marginTop: "10px" }}>{alarmStatus}</p>
          </div>
        </div>
      </section>

      {/* 05. I TUOI SCENARI SALVATI */}
      <section id="salvati" className="panel">
        <div className="sectionTitle">
          <div>
            <span>05</span>
            <h2>I tuoi scenari salvati</h2>
          </div>
          <small>{presets.length}/10 salvati</small>
        </div>
        <p>Salva il mix che hai creato per riascoltarlo o condividerlo con un tocco.</p>

        <div className="saveRow">
          <input
            type="text"
            placeholder="Nome scenario (es. Notte sul divano col gatto)"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button className="primary" onClick={savePreset}>
            Salva scenario
          </button>
        </div>

        <div className="presetList">
          {presets.length === 0 ? (
            <p className="empty" style={{ color: "var(--muted)", margin: "12px 0 0" }}>
              Nessuno scenario salvato. Componi un mix e clicca su "Salva scenario".
            </p>
          ) : (
            presets.map((preset) => (
              <div key={preset.id} className="preset">
                <button
                  className="presetLoad"
                  onClick={() => {
                    setMix(preset.mix);
                    setActiveScenario("");
                    if (!playing) {
                      void startEngineWithMix(preset.mix);
                    } else {
                      engineRef.current?.setMix(preset.mix);
                    }
                    showToast(`Scenario "${preset.name}" avviato!`);
                  }}
                >
                  <span>▶</span>
                  <b>{preset.name}</b>
                </button>
                <button
                  className="presetShare"
                  title="Condividi questo scenario"
                  onClick={() => void shareCurrentMix(preset.name, preset.mix)}
                >
                  🔗 Condividi
                </button>
                <button className="delete" title="Elimina" onClick={() => deletePreset(preset.id)}>
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <footer>
        <span><b>SleepScape</b> · PWA con sintesi Web Audio 100% offline</span>
        <span>Creato per un riposo naturale e personalizzato</span>
      </footer>

      {/* --- PERSISTENT FLOATING BOTTOM PLAYER BAR --- */}
      <aside className="bottomPlayer" aria-label="Riproduttore audio fisso">
        <div className="bottomPlayerInner">
          <div className="bottomPlayerLeft">
            <div className={`statusDot ${playing ? "active" : ""}`} />
            <div className="bottomPlayerText">
              <div className="bottomPlayerTitle">{currentAmbianceName}</div>
              <div className="bottomPlayerMeta">
                <span>{playing ? "In riproduzione" : "In pausa"}</span>
                <span>·</span>
                <span>{activeCount} suoni attivi</span>
                {timerEnd && (
                  <>
                    <span>·</span>
                    <span className="timerTag">⏱️ {formatRemaining(remaining)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="bottomPlayerCenter">
            <button
              className={`bottomPlayBtn ${playing ? "" : "paused"}`}
              onClick={togglePlay}
              disabled={starting}
              title={playing ? "Pausa / Ferma" : "Avvia riproduzione"}
            >
              <span>{playing ? "■" : "▶"}</span>
              {playing ? "Ferma" : "Ascolta"}
            </button>
          </div>

          <div className="bottomPlayerRight">
            <button
              className="bottomNavBtn"
              onClick={() => void shareCurrentMix()}
              title="Condividi scenario attuale"
            >
              🔗 Condividi
            </button>
            <a href="#mixer" className="bottomNavBtn">Mixer</a>
            <a href="#crea" className="bottomNavBtn">Crea</a>
          </div>
        </div>
      </aside>
    </main>
  );
}
