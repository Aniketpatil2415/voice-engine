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
  IndianRupee,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Play,
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

  // Load persisted ledger from localStorage
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

  // Save ledger on change
  useEffect(() => {
    try {
      localStorage.setItem("bolikhata_customers_v1", JSON.stringify(customers));
      localStorage.setItem("bolikhata_tx_v1", JSON.stringify(transactions));
    } catch {
      // Ignore storage quota errors
    }
  }, [customers, transactions]);

  // Neural TTS Playback (Madhur Male Voice)
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

  // Apply structured voice action to ledger state
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

      // Handle CHECK_BALANCE
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

      // Save Undo snapshot before mutating ledger
      setUndoSnapshot({
        customers: [...customers],
        transactions: [...transactions],
        label:
          data.intent === "UPDATE_LAST"
            ? "पिछला सुधार वापस करें"
            : `${data.customerName || "ग्राहक"} की एंट्री हटाएं`,
      });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 12000);

      // Handle UPDATE_LAST
      if (data.intent === "UPDATE_LAST" && transactions.length > 0) {
        const lastTx = transactions[0];
        const deltaDiff = data.udhaarDelta - lastTx.udhaarDelta;

        const updatedTx: Transaction = {
          ...lastTx,
          items: data.items.length > 0 ? data.items : lastTx.items,
          totalAmount: data.totalAmount,
          paidAmount: data.paidAmount,
          udhaarDelta: data.udhaarDelta,
          timestamp: `${nowTime} (Edited)`,
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

      // Handle ADD_SALE or RECORD_PAYMENT
      const nameToMatch = data.customerName || "नया ग्राहक";
      const existing = customers.find(
        (c) => c.name.toLowerCase() === nameToMatch.toLowerCase()
      );

      let targetCustomerId = existing?.id || `cust-${Date.now()}`;

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

  // Start Mic Recording
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
      setErrorMsg("माइक की परमिशन नहीं मिली। ब्राउज़र में Mic Allow करें।");
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

  // KPI Calculations
  const totalMarketUdhaar = customers.reduce(
    (sum, c) => sum + c.totalUdhaar,
    0
  );
  const todayCashCollected = transactions.reduce(
    (sum, t) => sum + t.paidAmount,
    0
  );

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 font-sans selection:bg-blue-500/30 pb-36">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#070709]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <span className="font-mono font-bold tracking-wider text-sm sm:text-base text-white">
              {BOLIKHATA_CONFIG.appName}
            </span>
            <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              VOICE-POS v2.0
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOfflineDemo((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                showOfflineDemo
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
              }`}
              title="Test without API key"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Demo Mode</span>
            </button>

            <button
              onClick={() => setTtsEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                ttsEnabled
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}
            >
              {ttsEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>{ttsEnabled ? "TTS ON" : "MUTED"}</span>
            </button>

            <button
              onClick={handleResetDemo}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
              title="Reset Ledger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            layout
            className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                कुल बाज़ार उधार (Udhaar)
              </p>
              <motion.p
                key={totalMarketUdhaar}
                initial={{ scale: 1.08, color: "#f87171" }}
                animate={{ scale: 1, color: "#ffffff" }}
                className="text-2xl sm:text-3xl font-bold mt-1 font-mono"
              >
                ₹{totalMarketUdhaar.toLocaleString("en-IN")}
              </motion.p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </motion.div>

          <motion.div
            layout
            className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                आज की कैश वसूली (Cash)
              </p>
              <motion.p
                key={todayCashCollected}
                initial={{ scale: 1.08, color: "#34d399" }}
                animate={{ scale: 1, color: "#ffffff" }}
                className="text-2xl sm:text-3xl font-bold mt-1 font-mono"
              >
                ₹{todayCashCollected.toLocaleString("en-IN")}
              </motion.p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </motion.div>

          <motion.div
            layout
            className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                सक्रिय ग्राहक (Customers)
              </p>
              <p className="text-2xl sm:text-3xl font-bold mt-1 font-mono text-white">
                {customers.length}
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
          </motion.div>
        </div>

        {/* Zero-Key Offline Demo Bar */}
        <AnimatePresence>
          {showOfflineDemo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-300 text-xs font-mono uppercase">
                    <Sparkles className="w-4 h-4" />
                    <span>Zero-Key Judge Demo Simulator (1-Click Test)</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    Works offline without GROQ_API_KEY
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {OFFLINE_DEMO_SCENARIOS.map((scenario, idx) => (
                    <button
                      key={idx}
                      onClick={() => applyVoiceAction(scenario.response)}
                      className="flex items-center gap-2 text-left p-2.5 rounded-xl bg-zinc-900/90 hover:bg-blue-600/20 border border-zinc-800 hover:border-blue-500/50 text-xs text-zinc-200 transition-all cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="line-clamp-2">{scenario.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Banner */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-3"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Voice Response & Recent Transactions */}
          <div className="lg:col-span-7 space-y-5">
            {/* Latest Voice Action Card */}
            <AnimatePresence mode="wait">
              {latestResponse ? (
                <motion.div
                  key={latestResponse.transcript + latestResponse.latency_ms.total}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  className={`p-5 rounded-2xl border ${
                    latestResponse.status === "key_missing" ||
                    latestResponse.status === "needs_clarification"
                      ? "bg-amber-950/20 border-amber-500/40"
                      : "bg-zinc-900/80 border-zinc-700/80 shadow-lg shadow-black/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      {latestResponse.intent}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                      <span>STT {latestResponse.latency_ms.stt}ms</span>
                      <span>•</span>
                      <span>LLM {latestResponse.latency_ms.llm}ms</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-semibold">
                        {latestResponse.latency_ms.total}ms
                      </span>
                    </div>
                  </div>

                  {latestResponse.transcript && (
                    <p className="text-sm text-zinc-300 italic mb-3">
                      “{latestResponse.transcript}”
                    </p>
                  )}

                  <div className="p-3.5 rounded-xl bg-black/50 border border-zinc-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm text-emerald-300">
                      <Volume2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{latestResponse.spoken_reply}</span>
                    </div>

                    {undoSnapshot && (
                      <button
                        onClick={handleUndo}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        UNDO
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center space-y-2"
                >
                  <p className="text-xs font-mono uppercase tracking-widest text-blue-400">
                    Ready for Voice Input
                  </p>
                  <h2 className="text-xl font-bold text-white">
                    बोलो, खाता तुरंत अपडेट होगा।
                  </h2>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    नीचे माइक दबाएं और बोलें: “रमेश के खाते में 2 किलो चीनी 90
                    रुपये उधार लिख दो” या “सुरेश ने 500 रुपये जमा कर दिए”
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent Transactions Feed */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  ताज़ा लेन-देन (Live Ledger)
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  {transactions.length} entries
                </span>
              </div>

              <div className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {transactions.map((tx) => (
                    <motion.div
                      key={tx.id}
                      layout
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 350, damping: 28 }}
                      className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {tx.customerName}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                                tx.type === "PAYMENT"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-blue-500/15 text-blue-400"
                              }`}
                            >
                              {tx.type === "PAYMENT" ? "जमा (PAID)" : "बिक्री (SALE)"}
                            </span>
                            <span className="text-[11px] text-zinc-500 font-mono">
                              {tx.timestamp}
                            </span>
                          </div>

                          {tx.items.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {tx.items.map((item, i) => (
                                <span
                                  key={i}
                                  className="text-xs px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300"
                                >
                                  {item.name} ({item.qty}) • ₹{item.price}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className={`font-mono font-bold text-base ${
                              tx.udhaarDelta > 0
                                ? "text-red-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {tx.udhaarDelta > 0
                              ? `+₹${tx.udhaarDelta}`
                              : `-₹${Math.abs(tx.udhaarDelta)}`}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {tx.udhaarDelta > 0 ? "उधार बढ़ा" : "जमा हुआ"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-zinc-500 truncate max-w-[65%]">
                          “{tx.rawTranscript}”
                        </span>
                        <button
                          onClick={() => openWhatsAppBill(tx)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 text-xs font-medium transition-all cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp पर्ची
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Column: Customer Khata Balances */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <IndianRupee className="w-3.5 h-3.5" />
                ग्राहक खाता बही (Customer Khata)
              </h3>
            </div>

            <div className="space-y-2.5">
              <AnimatePresence>
                {customers.map((cust) => {
                  const isHighlighted = highlightedCustomerId === cust.id;
                  return (
                    <motion.div
                      key={cust.id}
                      layout
                      animate={{
                        scale: isHighlighted ? 1.02 : 1,
                        borderColor: isHighlighted
                          ? "rgba(59, 130, 246, 0.8)"
                          : "rgba(39, 39, 42, 0.8)",
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 24 }}
                      className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                        isHighlighted
                          ? "bg-blue-950/30 shadow-lg shadow-blue-500/10"
                          : "bg-zinc-900/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm text-blue-400">
                          {cust.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">
                            {cust.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {cust.lastActivity}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-mono font-bold text-base ${
                            cust.totalUdhaar > 0
                              ? "text-red-400"
                              : "text-emerald-400"
                          }`}
                        >
                          ₹{cust.totalUdhaar.toLocaleString("en-IN")}
                        </p>
                        <p className="text-[10px] font-mono uppercase text-zinc-500">
                          {cust.totalUdhaar > 0 ? "बाकी (Due)" : "साफ़ (Clear)"}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Floating Tactile Voice Dock */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-[#070709] via-[#070709]/95 to-transparent pt-6 pb-5 px-4">
        <div className="max-w-xl mx-auto">
          <div className="p-2 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3">
            <div className="pl-3 flex items-center gap-3 overflow-hidden">
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-mono text-red-400 font-semibold">
                    सुन रहा हूँ... (बोलने के बाद STOP दबाएं)
                  </span>
                </div>
              ) : isProcessing ? (
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-ping" />
                  <span className="text-xs font-mono text-blue-400">
                    हिसाब समझ रहा हूँ...
                  </span>
                </div>
              ) : (
                <span className="text-xs font-mono text-zinc-400 truncate">
                  TAP MIC • HINDI / MARATHI / HINGLISH
                </span>
              )}
            </div>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`relative flex items-center gap-2 px-6 py-3 rounded-xl font-mono text-xs font-bold tracking-wider transition-all cursor-pointer shrink-0 ${
                isRecording
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
                  : isProcessing
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-white hover:bg-zinc-200 text-black shadow-lg shadow-white/10"
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
      </div>
    </div>
  );
}