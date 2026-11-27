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
  Radio,
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
} from "@/config/domain";

interface UndoSnapshot {
  customers: Customer[];
  transactions: Transaction[];
  label: string;
}

const WAVE_BARS = [14, 26, 38, 20, 44, 30, 18, 40, 24, 34, 16, 28];

export default function VoiceEngineUI() {
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [transactions, setTransactions] =
    useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [latestResponse, setLatestResponse] =
    useState<VoiceActionResponse | null>(null);
  const [highlightedCustomerId, setHighlightedCustomerId] = useState<
    string | null
  >(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [showOfflineDemo, setShowOfflineDemo] = useState(false);
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

  useEffect(() => {
    try {
      const savedCust = localStorage.getItem("bolikhata_customers_v1");
      const savedTx = localStorage.getItem("bolikhata_tx_v1");
      if (savedCust) setCustomers(JSON.parse(savedCust));
      if (savedTx) setTransactions(JSON.parse(savedTx));
    } catch {
      // Fallback to initial data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("bolikhata_customers_v1", JSON.stringify(customers));
      localStorage.setItem("bolikhata_tx_v1", JSON.stringify(transactions));
    } catch {
      // Ignore storage quota errors
    }
  }, [customers, transactions]);

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
          body: JSON.stringify({ text }),
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
          utterance.lang = "hi-IN";
          window.speechSynthesis.speak(utterance);
        }
      }
    },
    [ttsEnabled]
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
          const dynamicReply = `${target.name} के खाते में कुल ${target.totalUdhaar} रुपये उधार बाकी हैं।`;
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
          timestamp: `${nowTime} · EDITED`,
          rawTranscript: data.transcript,
        };

        setTransactions((prev) => [updatedTx, ...prev.slice(1)]);
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === lastTx.customerId
              ? {
                  ...c,
                  totalUdhaar: Math.max(0, c.totalUdhaar + deltaDiff),
                  lastActivity: `आज, ${nowTime}`,
                }
              : c
          )
        );
        setHighlightedCustomerId(lastTx.customerId);
        setTimeout(() => setHighlightedCustomerId(null), 3500);
        speakReply(data.spoken_reply);
        return;
      }

      const nameToMatch = data.customerName || "नया ग्राहक";
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
                  lastActivity: `आज, ${nowTime}`,
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
          lastActivity: `आज, ${nowTime}`,
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
    [customers, transactions, speakReply]
  );

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
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        await sendAudioToEngine(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setErrorMsg("MIC_PERMISSION_DENIED :: ब्राउज़र में Mic Allow करें।");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToEngine = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.webm");
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

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setCustomers(undoSnapshot.customers);
    setTransactions(undoSnapshot.transactions);
    setUndoSnapshot(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    speakReply("पिछली एंट्री वापस हटा दी गई है।");
  };

  const handleResetDemo = () => {
    setCustomers(INITIAL_CUSTOMERS);
    setTransactions(INITIAL_TRANSACTIONS);
    setLatestResponse(null);
    setUndoSnapshot(null);
    setHistory([]);
    localStorage.removeItem("bolikhata_customers_v1");
    localStorage.removeItem("bolikhata_tx_v1");
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
        ? `• जमा राशि: ₹${tx.paidAmount}`
        : `• कुल राशि: ₹${tx.totalAmount}`;

    const msg = `नमस्ते ${tx.customerName} जी,\n*BoliKhata डिजिटल पर्ची*\n\n${itemsText}\n\nकुल बिल: ₹${tx.totalAmount}\nनकद जमा: ₹${tx.paidAmount}\n*कुल बकाया उधार: ₹${cust?.totalUdhaar ?? 0}*\n\nधन्यवाद!`;
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

  return (
    <div className="min-h-screen bg-[#050505] text-[#F4F4F5] font-sans selection:bg-white selection:text-black">
      {/* Top Hardware Status Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  isRecording
                    ? "bg-[#FF3B30] animate-ping"
                    : isProcessing
                    ? "bg-amber-400 animate-pulse"
                    : "bg-[#00E676]"
                }`}
              />
              <span className="font-mono font-bold tracking-[0.2em] text-xs uppercase text-white">
                {BOLIKHATA_CONFIG.appName}
              </span>
            </div>
            <span className="hidden md:inline-block text-[10px] font-mono tracking-[0.15em] text-zinc-500 border-l border-zinc-800 pl-4">
              ZERO-TYPING VOICE LEDGER // HI · MR · EN
            </span>
          </div>

          <div className="flex items-center divide-x divide-zinc-800 border-x border-zinc-800 h-full">
            <button
              onClick={() => setShowOfflineDemo((v) => !v)}
              className={`h-full px-3.5 text-[10px] font-mono tracking-[0.15em] uppercase flex items-center gap-1.5 transition-colors cursor-pointer ${
                showOfflineDemo
                  ? "bg-white text-black font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900"
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span>SIMULATOR</span>
            </button>

            <button
              onClick={() => setTtsEnabled((v) => !v)}
              className={`h-full px-3.5 text-[10px] font-mono tracking-[0.15em] uppercase flex items-center gap-1.5 transition-colors cursor-pointer ${
                ttsEnabled
                  ? "text-[#00E676] hover:bg-zinc-900"
                  : "text-zinc-600 hover:text-zinc-300"
              }`}
            >
              {ttsEnabled ? (
                <Volume2 className="w-3 h-3" />
              ) : (
                <VolumeX className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {ttsEnabled ? "VOICE ON" : "MUTED"}
              </span>
            </button>

            <button
              onClick={handleResetDemo}
              className="h-full px-3 text-zinc-500 hover:text-[#FF3B30] hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Reset Ledger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Architectural Grid */}
      <main className="max-w-7xl mx-auto border-x border-zinc-800 min-h-[calc(100vh-3rem)]">
        {/* Top Metrics Strip (No Cards — Pure Hairline Grid) */}
        <section className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 border-b border-zinc-800">
          <div className="p-5 sm:p-6 flex flex-col justify-between bg-[#080808]">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              01 // TOTAL MARKET UDHAAR
            </span>
            <motion.div
              key={totalMarketUdhaar}
              initial={{ opacity: 0.4, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-baseline justify-between"
            >
              <span className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-white">
                ₹{totalMarketUdhaar.toLocaleString("en-IN")}
              </span>
              <span className="text-[10px] font-mono text-[#FF3B30] uppercase tracking-wider">
                DUE
              </span>
            </motion.div>
          </div>

          <div className="p-5 sm:p-6 flex flex-col justify-between bg-[#080808]">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              02 // TODAY CASH COLLECTED
            </span>
            <motion.div
              key={todayCashCollected}
              initial={{ opacity: 0.4, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-baseline justify-between"
            >
              <span className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-white">
                ₹{todayCashCollected.toLocaleString("en-IN")}
              </span>
              <span className="text-[10px] font-mono text-[#00E676] uppercase tracking-wider">
                INFLOW
              </span>
            </motion.div>
          </div>

          <div className="p-5 sm:p-6 flex flex-col justify-between bg-[#080808]">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              03 // ACTIVE KHATA ACCOUNTS
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-white">
                {String(customers.length).padStart(2, "0")}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                LOCAL_SYNC
              </span>
            </div>
          </div>
        </section>

        {/* Zero-Key Offline Simulator Drawer */}
        <AnimatePresence>
          {showOfflineDemo && (
            <motion.section
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-zinc-800 bg-[#0C0C0E]"
            >
              <div className="p-4 sm:px-6 flex flex-col gap-3">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-400">
                  <span>OFFLINE JUDGE SIMULATOR // NO API KEY REQUIRED</span>
                  <span className="text-zinc-600">CLICK TO EXECUTE</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {OFFLINE_DEMO_SCENARIOS.map((scenario, idx) => (
                    <button
                      key={idx}
                      onClick={() => applyVoiceAction(scenario.response)}
                      className="group text-left p-3 border border-zinc-800 bg-[#050505] hover:border-white hover:bg-zinc-900 transition-all cursor-pointer flex items-start gap-2.5"
                    >
                      <Play className="w-3 h-3 mt-0.5 text-zinc-500 group-hover:text-white shrink-0" />
                      <span className="text-xs text-zinc-300 group-hover:text-white leading-snug">
                        {scenario.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Hardware Voice Command Console (Centerpiece) */}
        <section className="border-b border-zinc-800 bg-[#050505] p-5 sm:p-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
            {/* Left: Live Status + Waveform + Transcript */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-center gap-3 text-[10px] font-mono tracking-[0.2em] uppercase">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Radio className="w-3 h-3" />
                  VOICE CONSOLE
                </span>
                {latestResponse && (
                  <span className="text-zinc-400">
                    [ {latestResponse.intent} ·{" "}
                    <span className="text-[#00E676]">
                      {latestResponse.latency_ms.total}ms
                    </span>{" "}
                    ]
                  </span>
                )}
              </div>

              {isRecording ? (
                <div className="flex items-center gap-4 py-1">
                  <div className="flex items-end gap-1 h-9">
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
                        className="w-1 bg-[#FF3B30]"
                      />
                    ))}
                  </div>
                  <p className="font-mono text-xs sm:text-sm text-[#FF3B30] tracking-wide">
                    LISTENING... बोलने के बाद STOP दबाएं
                  </p>
                </div>
              ) : isProcessing ? (
                <div className="py-2 flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="h-4 w-4 border-2 border-zinc-700 border-t-white rounded-full"
                  />
                  <p className="font-mono text-xs sm:text-sm text-zinc-300 tracking-wide">
                    PROCESSING AUDIO → EXTRACTING LEDGER INTENT...
                  </p>
                </div>
              ) : latestResponse ? (
                <motion.div
                  key={latestResponse.transcript + latestResponse.latency_ms.total}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-1.5"
                >
                  {latestResponse.transcript && (
                    <p className="text-base sm:text-lg font-medium text-white tracking-tight">
                      “{latestResponse.transcript}”
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs font-mono text-[#00E676] flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 shrink-0" />
                      {latestResponse.spoken_reply}
                    </p>
                    {undoSnapshot && (
                      <button
                        onClick={handleUndo}
                        className="inline-flex items-center gap-1 px-2 py-0.5 border border-zinc-700 hover:border-white text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        {undoSnapshot.label}
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-1">
                  <p className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                    बोलो, खाता तुरंत अपडेट होगा।
                  </p>
                  <p className="text-xs font-mono text-zinc-500">
                    TRY: “रमेश के खाते में 2 किलो चीनी 90 रुपये उधार लिख दो”
                  </p>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 text-xs font-mono text-[#FF3B30] pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Right: Tactile Hardware Mic Trigger */}
            <div className="shrink-0">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-full md:w-48 h-14 flex items-center justify-center gap-3 font-mono text-xs font-bold tracking-[0.2em] uppercase border transition-all cursor-pointer ${
                  isRecording
                    ? "bg-[#FF3B30] border-[#FF3B30] text-white"
                    : isProcessing
                    ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-white border-white text-black hover:bg-zinc-200"
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    STOP
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    SPEAK
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </section>

        {/* Bottom 2-Column Split: Ledger Tape (Left) + Customer Directory (Right) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
          {/* Left: Live Transaction Tape */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="px-5 py-3 border-b border-zinc-800 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-400">
                LEDGER TAPE // LIVE ENTRIES
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                {transactions.length} RECORDS
              </span>
            </div>

            <div className="divide-y divide-zinc-800/80">
              <AnimatePresence initial={false}>
                {transactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                    className="p-5 hover:bg-[#0A0A0C] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-semibold text-base text-white">
                            {tx.customerName}
                          </span>
                          <span
                            className={`text-[10px] font-mono tracking-wider px-1.5 py-0.5 border ${
                              tx.type === "PAYMENT"
                                ? "border-[#00E676]/40 text-[#00E676]"
                                : "border-zinc-700 text-zinc-300"
                            }`}
                          >
                            {tx.type === "PAYMENT" ? "JAMA" : "SALE"}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {tx.timestamp}
                          </span>
                        </div>

                        {tx.items.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tx.items.map((item, idx) => (
                              <span
                                key={idx}
                                className="text-xs font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300"
                              >
                                {item.name} · {item.qty} · ₹{item.price}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-zinc-500 truncate max-w-md">
                          “{tx.rawTranscript}”
                        </p>
                      </div>

                      <div className="text-right shrink-0 space-y-2">
                        <p
                          className={`font-mono font-bold text-lg tabular-nums ${
                            tx.udhaarDelta > 0
                              ? "text-[#FF3B30]"
                              : "text-[#00E676]"
                          }`}
                        >
                          {tx.udhaarDelta > 0
                            ? `+₹${tx.udhaarDelta}`
                            : `-₹${Math.abs(tx.udhaarDelta)}`}
                        </p>

                        <button
                          onClick={() => openWhatsAppBill(tx)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-zinc-800 hover:border-[#00E676] text-zinc-400 hover:text-[#00E676] text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3 h-3" />
                          PARCHI
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Customer Khata Directory */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="px-5 py-3 border-b border-zinc-800 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-400">
                CUSTOMER KHATA // BALANCES
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                INR (₹)
              </span>
            </div>

            <div className="divide-y divide-zinc-800/80">
              <AnimatePresence>
                {customers.map((cust, index) => {
                  const isHighlighted = highlightedCustomerId === cust.id;
                  return (
                    <motion.div
                      key={cust.id}
                      layout
                      animate={{
                        backgroundColor: isHighlighted
                          ? "rgba(255, 255, 255, 0.08)"
                          : "rgba(5, 5, 5, 0)",
                      }}
                      transition={{ duration: 0.25 }}
                      className="px-5 py-4 flex items-center justify-between hover:bg-[#0A0A0C] transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-[10px] font-mono text-zinc-600 w-5">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="font-semibold text-sm text-white">
                            {cust.name}
                          </p>
                          <p className="text-[11px] font-mono text-zinc-500">
                            {cust.lastActivity}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-mono font-bold text-base tabular-nums ${
                            cust.totalUdhaar > 0
                              ? "text-white"
                              : "text-[#00E676]"
                          }`}
                        >
                          ₹{cust.totalUdhaar.toLocaleString("en-IN")}
                        </p>
                        <p className="text-[9px] font-mono tracking-[0.15em] uppercase text-zinc-500">
                          {cust.totalUdhaar > 0 ? "UDHAAR" : "SETTLED"}
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
    </div>
  );
}