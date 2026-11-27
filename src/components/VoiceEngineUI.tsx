"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
  MessageCircle,
  Terminal,
  Trash2,
  Play,
  AlertTriangle,
  Sun,
  Moon,
  Store,
  IndianRupee,
  Wallet,
  Users,
} from "lucide-react";
import {
  Customer,
  Transaction,
  VoiceActionResponse,
} from "@/types/bolikhata";
import {
  BOLIKHATA_CONFIG,
  INITIAL_CUSTOMERS,
  INITIAL_TRANSACTIONS,
  OFFLINE_DEMO_SCENARIOS,
  UI_TEXT,
  SupportedLang,
} from "@/config/domain";

interface UndoSnapshot {
  customers: Customer[];
  transactions: Transaction[];
  label: string;
}

const WAVE_BARS = [14, 26, 38, 20, 44, 30, 18, 40, 24, 34, 16, 28];

export default function VoiceEngineUI() {
  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeLang, setActiveLang] = useState<SupportedLang>("en");
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [transactions, setTransactions] =
    useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [latestResponse, setLatestResponse] =
    useState<VoiceActionResponse | null>(null);
  const [highlightedCustomerId, setHighlightedCustomerId] = useState<
    string | null
  >(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [showOfflineDemo, setShowOfflineDemo] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [history, setHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-Stop (VAD) Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const t = UI_TEXT[activeLang];

  // Load saved ledger & theme
  useEffect(() => {
    try {
      const savedCust = localStorage.getItem("voxledger_customers_v3");
      const savedTx = localStorage.getItem("voxledger_tx_v3");
      const savedTheme = localStorage.getItem("voxledger_theme_v3");
      if (savedCust) setCustomers(JSON.parse(savedCust));
      if (savedTx) setTransactions(JSON.parse(savedTx));
      if (savedTheme === "dark") setIsDark(true);
    } catch {
      // Fallback to initial data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("voxledger_customers_v3", JSON.stringify(customers));
      localStorage.setItem("voxledger_tx_v3", JSON.stringify(transactions));
      localStorage.setItem("voxledger_theme_v3", isDark ? "dark" : "light");
    } catch {
      // Ignore storage quota errors
    }
  }, [customers, transactions, isDark]);

  // Cleanup VAD audio monitoring
  const cleanupVad = useCallback(() => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupVad();
    };
  }, [cleanupVad]);

  const speakReply = useCallback(
    async (text: string) => {
      if (!ttsEnabled || typeof window === "undefined" || !text) return;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang: activeLang }),
        });

        if (!res.ok) throw new Error("Neural TTS failed");

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } catch {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang =
            activeLang === "en"
              ? "en-IN"
              : activeLang === "mr"
              ? "mr-IN"
              : "hi-IN";
          window.speechSynthesis.speak(utterance);
        }
      }
    },
    [ttsEnabled, activeLang]
  );

  const applyVoiceAction = useCallback(
    (data: VoiceActionResponse) => {
      setLatestResponse(data);

      if (data.status === "key_missing") {
        setShowOfflineDemo(true);
        speakReply(data.spoken_reply);
        return;
      }

      if (data.status === "needs_clarification" || data.intent === "CLARIFY") {
        speakReply(data.spoken_reply);
        return;
      }

      const nowTime = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (data.intent === "CHECK_BALANCE") {
        const target = customers.find(
          (c) =>
            data.customerName &&
            c.name.toLowerCase() === data.customerName.toLowerCase()
        );
        if (target) {
          setHighlightedCustomerId(target.id);
          setTimeout(() => setHighlightedCustomerId(null), 4000);
          const dynamicReply =
            activeLang === "en"
              ? `${target.name} has a pending balance of ${target.totalUdhaar} rupees.`
              : activeLang === "mr"
              ? `${target.name} यांच्या खात्यात एकूण ${target.totalUdhaar} रुपये उधार बाकी आहेत.`
              : `${target.name} के खाते में कुल ${target.totalUdhaar} रुपये उधार बाकी हैं।`;
          setLatestResponse({ ...data, spoken_reply: dynamicReply });
          speakReply(dynamicReply);
        } else {
          speakReply(data.spoken_reply);
        }
        return;
      }

      setUndoSnapshot({
        customers: [...customers],
        transactions: [...transactions],
        label:
          data.intent === "UPDATE_LAST"
            ? "UNDO EDIT"
            : `UNDO ${data.customerName || "ENTRY"}`,
      });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 12000);

      if (data.intent === "UPDATE_LAST" && transactions.length > 0) {
        const lastTx = transactions[0];
        const deltaDiff = data.udhaarDelta - lastTx.udhaarDelta;

        const updatedTx: Transaction = {
          ...lastTx,
          items: data.items.length > 0 ? data.items : lastTx.items,
          totalAmount: data.totalAmount,
          paidAmount: data.paidAmount,
          udhaarDelta: data.udhaarDelta,
          timestamp: `${nowTime} · Edited`,
          rawTranscript: data.transcript,
        };

        setTransactions((prev) => [updatedTx, ...prev.slice(1)]);
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === lastTx.customerId
              ? {
                  ...c,
                  totalUdhaar: Math.max(0, c.totalUdhaar + deltaDiff),
                  lastActivity: `Today, ${nowTime}`,
                }
              : c
          )
        );
        setHighlightedCustomerId(lastTx.customerId);
        setTimeout(() => setHighlightedCustomerId(null), 3500);
        speakReply(data.spoken_reply);
        return;
      }

      const nameToMatch = data.customerName || "New Customer";
      const existing = customers.find(
        (c) => c.name.toLowerCase() === nameToMatch.toLowerCase()
      );

      const targetCustomerId = existing?.id || `cust-${Date.now()}`;

      if (existing) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  totalUdhaar: Math.max(0, c.totalUdhaar + data.udhaarDelta),
                  lastActivity: `Today, ${nowTime}`,
                }
              : c
          )
        );
      } else {
        const newCustomer: Customer = {
          id: targetCustomerId,
          name: nameToMatch,
          phone: "919822000000",
          totalUdhaar: Math.max(0, data.udhaarDelta),
          lastActivity: `Today, ${nowTime}`,
        };
        setCustomers((prev) => [newCustomer, ...prev]);
      }

      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        customerId: targetCustomerId,
        customerName: nameToMatch,
        type: data.intent === "RECORD_PAYMENT" ? "PAYMENT" : "SALE",
        items: data.items || [],
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
        udhaarDelta: data.udhaarDelta,
        timestamp: nowTime,
        rawTranscript: data.transcript,
      };

      setTransactions((prev) => [newTx, ...prev]);
      setHighlightedCustomerId(targetCustomerId);
      setTimeout(() => setHighlightedCustomerId(null), 3500);

      setHistory((prev) => [
        ...prev.slice(-4),
        { role: "user", content: data.transcript },
        { role: "assistant", content: JSON.stringify(data) },
      ]);

      speakReply(data.spoken_reply);
    },
    [customers, transactions, speakReply, activeLang]
  );

  const stopRecording = useCallback(() => {
    cleanupVad();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [cleanupVad]);

  const sendAudioToEngine = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.webm");
      formData.append("lang", activeLang);
      formData.append("history", JSON.stringify(history));
      formData.append(
        "customers",
        JSON.stringify(customers.map((c) => c.name))
      );

      const res = await fetch("/api/voice-engine", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Voice engine request failed");
      }

      applyVoiceAction(data as VoiceActionResponse);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        cleanupVad();
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        await sendAudioToEngine(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Hands-Free Auto-Stop (Silence Detection via Web Audio API)
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.fftSize);
        let hasSpoken = false;
        let silenceStart: number | null = null;
        const SPEECH_THRESHOLD = 0.025;
        const SILENCE_DURATION_MS = 1500;

        const detectSilence = () => {
          if (
            !mediaRecorderRef.current ||
            mediaRecorderRef.current.state !== "recording"
          ) {
            return;
          }

          analyser.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);

          if (rms > SPEECH_THRESHOLD) {
            hasSpoken = true;
            silenceStart = null;
          } else if (hasSpoken) {
            if (silenceStart === null) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart >= SILENCE_DURATION_MS) {
              stopRecording();
              return;
            }
          }

          vadRafRef.current = requestAnimationFrame(detectSilence);
        };

        vadRafRef.current = requestAnimationFrame(detectSilence);
      } catch {
        // Fallback: manual STOP still works cleanly
      }

      // 12-second safety cap
      maxDurationTimerRef.current = setTimeout(() => {
        stopRecording();
      }, 12000);
    } catch {
      setErrorMsg(t.micError);
    }
  };

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setCustomers(undoSnapshot.customers);
    setTransactions(undoSnapshot.transactions);
    setUndoSnapshot(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    speakReply(
      activeLang === "en"
        ? "Last entry has been undone."
        : activeLang === "mr"
        ? "शेवटची नोंद परत घेतली आहे."
        : "पिछली एंट्री वापस हटा दी गई है।"
    );
  };

  const handleResetDemo = () => {
    setCustomers(INITIAL_CUSTOMERS);
    setTransactions(INITIAL_TRANSACTIONS);
    setLatestResponse(null);
    setUndoSnapshot(null);
    setHistory([]);
    localStorage.removeItem("voxledger_customers_v3");
    localStorage.removeItem("voxledger_tx_v3");
  };

  const openWhatsAppBill = (tx: Transaction) => {
    const cust = customers.find((c) => c.id === tx.customerId);
    const phone = cust?.phone || "";
    const itemsText =
      tx.items.length > 0
        ? tx.items
            .map((i) => `• ${i.name} (${i.qty}) - ₹${i.price}`)
            .join("\n")
        : tx.type === "PAYMENT"
        ? `• Payment Received: ₹${tx.paidAmount}`
        : `• Total Amount: ₹${tx.totalAmount}`;

    const msg =
      activeLang === "en"
        ? `Hello ${tx.customerName},\n*${BOLIKHATA_CONFIG.appName} Digital Receipt*\n\n${itemsText}\n\nBill Total: ₹${tx.totalAmount}\nCash Paid: ₹${tx.paidAmount}\n*Total Pending Credit: ₹${cust?.totalUdhaar ?? 0}*\n\nThank you!`
        : `नमस्ते ${tx.customerName} जी,\n*${BOLIKHATA_CONFIG.appName} डिजिटल पर्ची*\n\n${itemsText}\n\nकुल बिल: ₹${tx.totalAmount}\nनकद जमा: ₹${tx.paidAmount}\n*कुल बकाया उधार: ₹${cust?.totalUdhaar ?? 0}*\n\nधन्यवाद!`;

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  const totalMarketUdhaar = customers.reduce(
    (sum, c) => sum + c.totalUdhaar,
    0
  );
  const todayCashCollected = transactions.reduce(
    (sum, t) => sum + t.paidAmount,
    0
  );

  // Theme + Liquid Glass Tokens
  const bgPage = isDark
    ? "bg-[#09090B] text-zinc-100"
    : "bg-[#F5F5F7] text-slate-900";
  const bgGlass = isDark ? "liquid-glass-dark" : "liquid-glass-light";
  const bgSurface = bgGlass;
  const bgSubtle = isDark
    ? "bg-white/[0.06] backdrop-blur-md"
    : "bg-white/45 backdrop-blur-md";
  const borderCol = isDark ? "border-white/15" : "border-white/60";
  const textMuted = isDark ? "text-zinc-400" : "text-slate-600";
  const textPrimary = isDark ? "text-white" : "text-slate-900";

  return (
    <div
      className={`relative min-h-screen w-full overflow-x-hidden transition-colors duration-300 font-sans pb-24 md:pb-10 ${bgPage}`}
    >
      {/* Vibrant iPhone-Style Mesh Backdrop for Glass Refraction */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`absolute -top-24 -left-20 h-96 w-96 rounded-full blur-3xl ${
            isDark ? "bg-blue-600/35" : "bg-sky-400/50"
          }`}
        />
        <div
          className={`absolute top-1/3 -right-24 h-96 w-96 rounded-full blur-3xl ${
            isDark ? "bg-indigo-600/30" : "bg-violet-400/40"
          }`}
        />
        <div
          className={`absolute -bottom-24 left-1/4 h-96 w-96 rounded-full blur-3xl ${
            isDark ? "bg-emerald-500/20" : "bg-cyan-300/45"
          }`}
        />
      </div>

      {/* Liquid Glass Sticky Header */}
      <header
        className={`sticky top-0 z-30 border-b ${borderCol} ${
          isDark
            ? "bg-[#09090D]/75 backdrop-blur-xl"
            : "bg-white/75 backdrop-blur-xl"
        }`}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0"
            >
              <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.div>
            <div className="min-w-0">
              <h1
                className={`font-bold tracking-tight text-sm sm:text-base leading-none truncate ${textPrimary}`}
              >
                {BOLIKHATA_CONFIG.appName}
              </h1>
              <p
                className={`hidden sm:block text-[11px] mt-0.5 truncate ${textMuted}`}
              >
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Sliding Language Switcher */}
            <div
              className={`flex items-center p-0.5 sm:p-1 rounded-xl border ${borderCol} ${bgSubtle}`}
            >
              {(["en", "hi", "mr"] as SupportedLang[]).map((code) => (
                <button
                  key={code}
                  onClick={() => setActiveLang(code)}
                  className={`relative px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeLang === code
                      ? "text-white"
                      : `${textMuted} hover:${textPrimary}`
                  }`}
                >
                  {activeLang === code && (
                    <motion.span
                      layoutId="activeLangPill"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 32,
                      }}
                      className="absolute inset-0 bg-blue-600 rounded-lg shadow-sm z-0"
                    />
                  )}
                  <span className="relative z-10">{UI_TEXT[code].label}</span>
                </button>
              ))}
            </div>

            {/* Day / Night Mode Toggle */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setIsDark((d) => !d)}
              className={`p-1.5 sm:p-2 rounded-xl border ${borderCol} ${bgSubtle} ${textPrimary} hover:border-blue-500 transition-colors cursor-pointer`}
              title={isDark ? "Switch to Day Mode" : "Switch to Night Mode"}
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700" />
              )}
            </motion.button>

            {/* Offline Simulator Toggle */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowOfflineDemo((v) => !v)}
              className={`flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                showOfflineDemo
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : `${borderCol} ${bgSubtle} ${textMuted} hover:${textPrimary}`
              }`}
              title="Demo Simulator"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.demoBtn}</span>
            </motion.button>

            {/* Voice TTS Toggle */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setTtsEnabled((v) => !v)}
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors cursor-pointer ${
                ttsEnabled
                  ? isDark
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : `${borderCol} ${bgSubtle} ${textMuted}`
              }`}
              title={ttsEnabled ? "Mute Voice" : "Unmute Voice"}
            >
              {ttsEnabled ? (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </motion.button>

            {/* Reset */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleResetDemo}
              className={`p-1.5 sm:p-2 rounded-xl border ${borderCol} ${bgSubtle} ${textMuted} hover:text-red-500 transition-colors cursor-pointer`}
              title="Reset Demo Data"
            >
              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </motion.button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Compact 3-Column KPI Strip (Liquid Glass) */}
        <section className="grid grid-cols-3 gap-2 sm:gap-4">
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`p-3 sm:p-5 rounded-2xl border ${borderCol} ${bgGlass} flex items-center justify-between min-w-0`}
          >
            <div className="min-w-0">
              <p
                className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate ${textMuted}`}
              >
                {t.kpiUdhaar}
              </p>
              <motion.p
                key={totalMarketUdhaar}
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="text-lg sm:text-3xl font-bold tabular-nums mt-0.5 sm:mt-1 text-red-600 dark:text-red-400 truncate"
              >
                ₹{totalMarketUdhaar.toLocaleString("en-IN")}
              </motion.p>
            </div>
            <div
              className={`hidden sm:flex h-11 w-11 rounded-xl items-center justify-center shrink-0 ${
                isDark
                  ? "bg-red-500/15 text-red-400"
                  : "bg-red-50 text-red-600"
              }`}
            >
              <IndianRupee className="w-5 h-5" />
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`p-3 sm:p-5 rounded-2xl border ${borderCol} ${bgGlass} flex items-center justify-between min-w-0`}
          >
            <div className="min-w-0">
              <p
                className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate ${textMuted}`}
              >
                {t.kpiCash}
              </p>
              <motion.p
                key={todayCashCollected}
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="text-lg sm:text-3xl font-bold tabular-nums mt-0.5 sm:mt-1 text-emerald-600 dark:text-emerald-400 truncate"
              >
                ₹{todayCashCollected.toLocaleString("en-IN")}
              </motion.p>
            </div>
            <div
              className={`hidden sm:flex h-11 w-11 rounded-xl items-center justify-center shrink-0 ${
                isDark
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`p-3 sm:p-5 rounded-2xl border ${borderCol} ${bgGlass} flex items-center justify-between min-w-0`}
          >
            <div className="min-w-0">
              <p
                className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate ${textMuted}`}
              >
                {t.kpiCustomers}
              </p>
              <p
                className={`text-lg sm:text-3xl font-bold tabular-nums mt-0.5 sm:mt-1 ${textPrimary}`}
              >
                {customers.length}
              </p>
            </div>
            <div
              className={`hidden sm:flex h-11 w-11 rounded-xl items-center justify-center shrink-0 ${
                isDark
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
          </motion.div>
        </section>

        {/* Zero-Key Offline Simulator Drawer */}
        <AnimatePresence>
          {showOfflineDemo && (
            <motion.section
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border backdrop-blur-xl ${
                  isDark
                    ? "bg-blue-950/30 border-blue-800/50"
                    : "bg-blue-50/80 border-blue-200/80"
                } space-y-2.5`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <span className="truncate">{t.demoBannerTitle}</span>
                  <span className="opacity-75 shrink-0">{t.demoBannerSub}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {OFFLINE_DEMO_SCENARIOS.map((scenario, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => applyVoiceAction(scenario.response)}
                      className={`text-left p-2.5 sm:p-3 rounded-xl border ${borderCol} ${bgSurface} hover:border-blue-500 transition-all cursor-pointer flex items-start gap-2`}
                    >
                      <Play className="w-3.5 h-3.5 mt-0.5 text-blue-600 shrink-0" />
                      <span
                        className={`text-xs font-medium leading-snug break-words ${textPrimary}`}
                      >
                        {scenario.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Liquid Glass Main Voice Console */}
        <section
          className={`relative overflow-hidden p-4 sm:p-6 rounded-2xl border-2 transition-all duration-300 ${
            isRecording
              ? "border-red-500/80 shadow-lg shadow-red-500/15"
              : borderCol
          } ${bgGlass}`}
        >
          {/* Subtle top specular glass sheen */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sm:gap-6">
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-semibold">
                <span
                  className={`px-2.5 py-0.5 rounded-lg border ${borderCol} ${
                    isDark
                      ? "bg-zinc-800/80 text-zinc-200"
                      : "bg-white/80 text-slate-700"
                  }`}
                >
                  UI: {t.nativeLabel} • Speak Any Language
                </span>
                {latestResponse && (
                  <span className={`font-mono text-[11px] ${textMuted}`}>
                    {latestResponse.intent} • {latestResponse.latency_ms.total}ms
                  </span>
                )}
              </div>

              {isRecording ? (
                <div className="flex items-center gap-3 sm:gap-4 py-1">
                  <div className="flex items-end gap-1 h-8 sm:h-9 shrink-0">
                    {WAVE_BARS.map((height, idx) => (
                      <motion.span
                        key={idx}
                        animate={{
                          height: [6, height, 8, height * 0.7, 6],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.75 + (idx % 4) * 0.12,
                          ease: "easeInOut",
                        }}
                        className="w-1 sm:w-1.5 rounded-full bg-red-500"
                      />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-red-500">
                    {t.listeningText}
                  </p>
                </div>
              ) : isProcessing ? (
                <div className="py-1 space-y-2">
                  <p
                    className={`text-xs sm:text-sm font-semibold ${textPrimary}`}
                  >
                    {t.processingText}
                  </p>
                  <div
                    className={`relative w-full max-w-md h-1.5 rounded-full overflow-hidden ${
                      isDark ? "bg-zinc-800" : "bg-slate-200"
                    }`}
                  >
                    <motion.div
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.05,
                        ease: "easeInOut",
                      }}
                      className="w-1/2 h-full bg-linear-to-r from-transparent via-blue-600 to-transparent"
                    />
                  </div>
                </div>
              ) : latestResponse ? (
                <motion.div
                  key={
                    latestResponse.transcript + latestResponse.latency_ms.total
                  }
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  className="space-y-2"
                >
                  {latestResponse.transcript && (
                    <p
                      className={`text-sm sm:text-lg font-semibold break-words ${textPrimary}`}
                    >
                      “{latestResponse.transcript}”
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <p className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 shrink-0" />
                      <span>{latestResponse.spoken_reply}</span>
                    </p>
                    {undoSnapshot && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={handleUndo}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${borderCol} ${bgSubtle} ${textPrimary} hover:border-red-500 hover:text-red-500 transition-colors cursor-pointer`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        {undoSnapshot.label}
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={activeLang}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1"
                >
                  <p className={`text-base sm:text-xl font-bold ${textPrimary}`}>
                    {t.idleHeadline}
                  </p>
                  <p className={`text-xs sm:text-sm ${textMuted}`}>
                    {t.tryPrefix} {t.sampleCommand}
                  </p>
                </motion.div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 text-xs font-medium text-red-500 pt-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Desktop Mic Button (Hidden on Mobile; Sticky Dock handles Mobile) */}
            <div className="hidden md:block shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`relative w-48 h-14 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-sm tracking-wide transition-all cursor-pointer shadow-md ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-red-600/30"
                    : isProcessing
                    ? `${bgSubtle} ${textMuted} cursor-not-allowed`
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30"
                }`}
              >
                {isRecording && (
                  <motion.span
                    initial={{ scale: 1, opacity: 0.65 }}
                    animate={{ scale: 1.22, opacity: 0 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.1,
                      ease: "easeOut",
                    }}
                    className="absolute inset-0 rounded-2xl border-2 border-red-500 pointer-events-none"
                  />
                )}
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>{t.stopBtn}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5" />
                    <span>{t.speakBtn}</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </section>

        {/* Bottom 2-Column Workspace */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Left: Recent Transactions */}
          <div
            className={`lg:col-span-7 rounded-2xl border ${borderCol} ${bgSurface} overflow-hidden flex flex-col shadow-sm`}
          >
            <div
              className={`px-4 sm:px-5 py-3 border-b ${borderCol} ${bgSubtle} flex items-center justify-between`}
            >
              <h2 className={`text-xs sm:text-sm font-bold ${textPrimary}`}>
                {t.recentEntries}
              </h2>
              <span className={`text-xs font-mono ${textMuted}`}>
                {transactions.length} {t.entriesCount}
              </span>
            </div>

            <div
              className={`divide-y ${
                isDark ? "divide-zinc-800" : "divide-slate-100"
              }`}
            >
              <AnimatePresence initial={false}>
                {transactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    layout
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                    className="p-3.5 sm:p-5 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span
                          className={`font-bold text-sm sm:text-base ${textPrimary}`}
                        >
                          {tx.customerName}
                        </span>
                        <span
                          className={`text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-md ${
                            tx.type === "PAYMENT"
                              ? isDark
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-emerald-50 text-emerald-700"
                              : isDark
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {tx.type === "PAYMENT" ? t.paidTag : t.saleTag}
                        </span>
                        <span className={`text-[11px] sm:text-xs ${textMuted}`}>
                          {tx.timestamp}
                        </span>
                      </div>

                      {tx.items.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tx.items.map((item, idx) => (
                            <span
                              key={idx}
                              className={`text-[11px] sm:text-xs font-medium px-2 py-0.5 sm:py-1 rounded-lg border ${borderCol} ${bgSubtle} ${textPrimary}`}
                            >
                              {item.name} ({item.qty}) — ₹{item.price}
                            </span>
                          ))}
                        </div>
                      )}

                      <p
                        className={`text-[11px] sm:text-xs truncate ${textMuted}`}
                      >
                        “{tx.rawTranscript}”
                      </p>
                    </div>

                    <div className="text-right shrink-0 space-y-2">
                      <p
                        className={`font-bold text-base sm:text-lg tabular-nums ${
                          tx.udhaarDelta > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {tx.udhaarDelta > 0
                          ? `+₹${tx.udhaarDelta}`
                          : `-₹${Math.abs(tx.udhaarDelta)}`}
                      </p>

                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => openWhatsAppBill(tx)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer ${
                          isDark
                            ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">
                          {t.whatsappBtn}
                        </span>
                        <span className="sm:hidden">Bill</span>
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Customer Khata Book */}
          <div
            className={`lg:col-span-5 rounded-2xl border ${borderCol} ${bgSurface} overflow-hidden flex flex-col shadow-sm`}
          >
            <div
              className={`px-4 sm:px-5 py-3 border-b ${borderCol} ${bgSubtle} flex items-center justify-between`}
            >
              <h2 className={`text-xs sm:text-sm font-bold ${textPrimary}`}>
                {t.customerKhata}
              </h2>
              <span className={`text-xs font-semibold ${textMuted}`}>
                INR (₹)
              </span>
            </div>

            <div
              className={`divide-y ${
                isDark ? "divide-zinc-800" : "divide-slate-100"
              }`}
            >
              <AnimatePresence>
                {customers.map((cust) => {
                  const isHighlighted = highlightedCustomerId === cust.id;
                  return (
                    <motion.div
                      key={cust.id}
                      layout
                      animate={{
                        backgroundColor: isHighlighted
                          ? isDark
                            ? "rgba(37, 99, 235, 0.2)"
                            : "rgba(37, 99, 235, 0.08)"
                          : "rgba(0, 0, 0, 0)",
                      }}
                      transition={{ duration: 0.25 }}
                      className="px-4 sm:px-5 py-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            isDark
                              ? "bg-zinc-800 text-blue-400"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {cust.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`font-bold text-sm truncate ${textPrimary}`}
                          >
                            {cust.name}
                          </p>
                          <p className={`text-xs truncate ${textMuted}`}>
                            {cust.lastActivity}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={`font-bold text-sm sm:text-base tabular-nums ${
                            cust.totalUdhaar > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          ₹{cust.totalUdhaar.toLocaleString("en-IN")}
                        </p>
                        <p className={`text-[11px] font-medium ${textMuted}`}>
                          {cust.totalUdhaar > 0 ? t.dueLabel : t.clearLabel}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      {/* Mobile iPhone-Style Floating Liquid Glass Mic Pill */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <div className={`p-1.5 rounded-full ${bgGlass}`}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative w-full h-12 rounded-full flex items-center justify-center gap-2.5 font-bold text-sm tracking-wide transition-all cursor-pointer ${
              isRecording
                ? "liquid-btn-red text-white"
                : isProcessing
                ? `${bgSubtle} ${textMuted} cursor-not-allowed`
                : "liquid-btn-blue text-white"
            }`}
          >
            {isRecording && (
              <motion.span
                initial={{ scale: 1, opacity: 0.65 }}
                animate={{ scale: 1.08, opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: 1.1,
                  ease: "easeOut",
                }}
                className="absolute inset-0 rounded-full border-2 border-red-400 pointer-events-none"
              />
            )}
            {isRecording ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>{t.stopBtn}</span>
              </>
            ) : isProcessing ? (
              <span>{t.processingText}</span>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                <span>{t.speakBtn}</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}