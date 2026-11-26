"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { DOMAIN_CONFIG, VoiceEngineResponse } from "@/config/domain";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const BAR_COUNT = 16;

export default function VoiceEngineUI() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(12));
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<VoiceEngineResponse[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speakReply = useCallback(
    async (text: string) => {
      if (!ttsEnabled || typeof window === "undefined") return;

      // Stop any currently playing audio
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
        // Fallback to browser TTS if needed
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

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setBars(Array(BAR_COUNT).fill(12));
  };

  const processAudioBlob = async (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `voice.${ext}`, { type: mimeType });
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("history", JSON.stringify(history));

      const res = await fetch("/api/voice-engine", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned invalid response (${res.status}). Terminal check karo.`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Voice engine failed");
      }

      const engineRes = data as VoiceEngineResponse;

      setResults((prev) => {
        if (engineRes.intent === "UPDATE_LAST" && prev.length > 0) {
          return [engineRes, ...prev.slice(1)];
        }
        return [engineRes, ...prev];
      });

      setHistory((prev) => [
        ...prev.slice(-4),
        { role: "user", content: engineRes.transcript },
        { role: "assistant", content: JSON.stringify(engineRes.card || engineRes.spoken_reply) },
      ]);

      if (engineRes.spoken_reply) speakReply(engineRes.spoken_reply);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);

    // Stop any playing TTS immediately so mic never records app's own voice
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

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateBars = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const nextBars = Array.from({ length: BAR_COUNT }, (_, i) => {
          const val = dataArray[i] || 0;
          return Math.max(12, Math.min(100, Math.round((val / 255) * 100)));
        });
        setBars(nextBars);
        animFrameRef.current = requestAnimationFrame(updateBars);
      };
      updateBars();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const duration = Date.now() - startTimeRef.current;
        stopVisualizer();
        stream.getTracks().forEach((t) => t.stop());

        if (duration < 500) {
          setErrorMsg("Too short. Kam se kam 1 second tak boliye.");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processAudioBlob(blob, mimeType);
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setErrorMsg("Microphone access denied. Browser settings mein mic allow karo.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex flex-col font-sans antialiased">
      {/* Minimal Hardware Header */}
      <header className="sticky top-0 z-20 bg-[#0A0A0A]/90 backdrop-blur-md border-b border-[#222]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRecording
                  ? "bg-[#FF3B30] animate-pulse"
                  : isProcessing
                  ? "bg-[#F5A623] animate-pulse"
                  : "bg-[#00E599]"
              }`}
            />
            <span className="font-mono text-sm font-semibold tracking-tight uppercase">
              {DOMAIN_CONFIG.appName}
            </span>
            <span className="hidden sm:inline-block font-mono text-[11px] text-[#666] border border-[#222] px-2 py-0.5 rounded">
              v1.0 • VOICE-OS
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className="h-8 px-2.5 rounded border border-[#262626] bg-[#141414] hover:border-[#444] text-xs font-mono text-[#A3A3A3] flex items-center gap-1.5 transition"
            >
              {ttsEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#00E599]" />
                  <span>TTS ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-[#666]" />
                  <span>MUTED</span>
                </>
              )}
            </button>
            {results.length > 0 && (
              <button
                onClick={() => {
                  setResults([]);
                  setHistory([]);
                  setErrorMsg(null);
                }}
                className="h-8 w-8 rounded border border-[#262626] bg-[#141414] hover:border-[#FF3B30]/60 hover:text-[#FF3B30] text-[#737373] flex items-center justify-center transition"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-6 pb-44">
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-lg bg-[#1A0D0D] border border-[#FF3B30]/40 text-[#FF6B6B] text-xs font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {results.length === 0 ? (
          <div className="mt-8 space-y-6">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#666]">
                Ready for voice input
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                Bolo. Action turant execute hoga.
              </h1>
              <p className="text-sm text-[#888]">
                Hindi, Marathi, ya Hinglish mein seedha command do. Koi typing nahi.
              </p>
            </div>

            <div className="border-t border-[#1F1F1F] pt-5 space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#555] mb-3">
                Test Commands
              </p>
              {DOMAIN_CONFIG.sampleCommands.map((cmd, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[#111] border border-[#1E1E1E] text-xs font-mono text-[#A3A3A3]"
                >
                  <span className="text-[#444] mr-2">0{idx + 1}</span>
                  “{cmd}”
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((item, idx) => (
              <div
                key={idx}
                className={`rounded-xl border bg-[#111111] overflow-hidden ${
                  item.status === "needs_clarification"
                    ? "border-[#F5A623]/50"
                    : "border-[#242424]"
                }`}
              >
                {/* Telemetry Bar */}
                <div className="px-4 py-2.5 bg-[#161616] border-b border-[#222] flex items-center justify-between gap-2 font-mono text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        item.status === "needs_clarification"
                          ? "bg-[#F5A623]"
                          : "bg-[#00E599]"
                      }`}
                    />
                    <span className="text-white font-medium">{item.intent}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#737373]">
                    <span>STT {item.latency_ms.stt}ms</span>
                    <span>•</span>
                    <span>LLM {item.latency_ms.llm}ms</span>
                    <span>•</span>
                    <span className="text-[#00E599] font-semibold">
                      {item.latency_ms.total}ms
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                  <p className="text-sm text-[#A3A3A3] leading-relaxed">
                    “{item.transcript}”
                  </p>

                  {item.card && (
                    <div className="rounded-lg bg-[#0A0A0A] border border-[#222] p-3.5 space-y-3">
                      <div className="flex items-baseline justify-between gap-2 border-b border-[#1C1C1C] pb-2">
                        <h3 className="text-sm font-semibold text-white">
                          {item.card.title}
                        </h3>
                        <span className="font-mono text-[10px] uppercase text-[#666]">
                          {item.card.subtitle}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {item.card.fields.map((field, fIdx) => (
                          <div
                            key={fIdx}
                            className={`p-2.5 rounded border ${
                              field.highlight
                                ? "bg-[#00E599]/10 border-[#00E599]/30"
                                : "bg-[#121212] border-[#1F1F1F]"
                            }`}
                          >
                            <div className="font-mono text-[10px] uppercase text-[#666]">
                              {field.label}
                            </div>
                            <div className="text-sm font-medium text-white mt-0.5">
                              {field.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spoken Reply & Undo */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#D4D4D4]">
                      <Volume2 className="w-3.5 h-3.5 text-[#00E599] shrink-0" />
                      <span>{item.spoken_reply}</span>
                    </div>
                    {idx === 0 && (
                      <button
                        onClick={() => setResults((prev) => prev.slice(1))}
                        className="px-2.5 py-1 rounded border border-[#262626] bg-[#161616] hover:border-[#444] text-[11px] font-mono text-[#A3A3A3] flex items-center gap-1 shrink-0 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        UNDO
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Tactile Bottom Hardware Dock */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-md border-t border-[#1F1F1F]">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          {/* Live 16-Bar Audio Equalizer */}
          <div className="flex-1 flex items-center gap-1 h-10 px-3 rounded-lg bg-[#111] border border-[#222] overflow-hidden">
            {isProcessing ? (
              <div className="flex items-center gap-2 font-mono text-xs text-[#F5A623]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>PROCESSING AUDIO...</span>
              </div>
            ) : isRecording ? (
              <div className="w-full h-full flex items-center justify-between gap-1">
                {bars.map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#FF3B30] rounded-full transition-all duration-75"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            ) : (
              <span className="font-mono text-xs text-[#666] truncate">
                TAP MIC • HI / MR / EN
              </span>
            )}
          </div>

          {/* Tactile Record Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`h-12 px-5 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition active:scale-95 shrink-0 ${
              isProcessing
                ? "bg-[#1A1A1A] text-[#555] border border-[#262626] cursor-wait"
                : isRecording
                ? "bg-[#FF3B30] text-white hover:bg-[#E0352B]"
                : "bg-white text-black hover:bg-[#E5E5E5]"
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>STOP</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>SPEAK</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}