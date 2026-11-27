import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BOLIKHATA_CONFIG } from "@/config/domain";

const HALLUCINATION_SET = new Set([
  "thank you",
  "thank you.",
  "thanks for watching",
  "thanks for watching.",
  "you",
  "you.",
  "bye",
  "bye.",
  ".",
  "",
]);

export async function POST(req: Request) {
  const totalStart = Date.now();

  try {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({
        transcript: "",
        intent: "CLARIFY",
        status: "key_missing",
        customerName: null,
        items: [],
        totalAmount: 0,
        paidAmount: 0,
        udhaarDelta: 0,
        spoken_reply:
          "ग्रोक एपीआई की सेट नहीं है। आप नीचे दिए गए ऑफलाइन डेमो बटन से टेस्ट कर सकते हैं।",
        missing_field: "GROQ_API_KEY not set in environment",
        latency_ms: { stt: 0, llm: 0, total: Date.now() - totalStart },
      });
    }

    const groq = new Groq({ apiKey });
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const historyRaw = formData.get("history") as string | null;
    const customersRaw = formData.get("customers") as string | null;

    if (!audioFile || audioFile.size < 1000) {
      return NextResponse.json({
        transcript: "",
        intent: "CLARIFY",
        status: "needs_clarification",
        customerName: null,
        items: [],
        totalAmount: 0,
        paidAmount: 0,
        udhaarDelta: 0,
        spoken_reply: "आवाज़ बहुत छोटी थी, कृपया थोड़ा साफ बोलिए।",
        missing_field: "Audio clarity",
        latency_ms: { stt: 0, llm: 0, total: Date.now() - totalStart },
      });
    }

    // 1. Speech-to-Text
    const sttStart = Date.now();
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      language: "hi",
      prompt: BOLIKHATA_CONFIG.whisperContextPrompt,
      response_format: "json",
      temperature: 0,
    });
    const sttMs = Date.now() - sttStart;

    const rawTranscript = (transcription.text || "").trim();
    if (
      !rawTranscript ||
      HALLUCINATION_SET.has(rawTranscript.toLowerCase()) ||
      rawTranscript.length < 2
    ) {
      return NextResponse.json({
        transcript: rawTranscript || "(No speech detected)",
        intent: "CLARIFY",
        status: "needs_clarification",
        customerName: null,
        items: [],
        totalAmount: 0,
        paidAmount: 0,
        udhaarDelta: 0,
        spoken_reply: "आवाज़ साफ नहीं आई, कृपया दोबारा बोलिए।",
        missing_field: "Speech input",
        latency_ms: { stt: sttMs, llm: 0, total: Date.now() - totalStart },
      });
    }

    // 2. Parse context
    let previousContext: { role: "user" | "assistant"; content: string }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) previousContext = parsed.slice(-4);
      } catch {
        previousContext = [];
      }
    }

    let customerNames: string[] = ["रमेश", "सुरेश", "अनीता", "मोहन"];
    if (customersRaw) {
      try {
        const parsed = JSON.parse(customersRaw);
        if (Array.isArray(parsed) && parsed.length > 0) customerNames = parsed;
      } catch {
        // fallback to defaults
      }
    }

    // 3. Structured Action Extraction
    const llmStart = Date.now();
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: BOLIKHATA_CONFIG.getSystemPrompt(customerNames),
        },
        ...previousContext,
        { role: "user", content: rawTranscript },
      ],
    });
    const llmMs = Date.now() - llmStart;

    const rawContent = completion.choices[0]?.message?.content || "{}";
    const cleanJson = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleanJson);

    return NextResponse.json({
      transcript: rawTranscript,
      intent: parsed.intent || "CLARIFY",
      status: parsed.status || "success",
      customerName: parsed.customerName || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      totalAmount: Number(parsed.totalAmount) || 0,
      paidAmount: Number(parsed.paidAmount) || 0,
      udhaarDelta: Number(parsed.udhaarDelta) || 0,
      spoken_reply: parsed.spoken_reply || "एंट्री सेव हो गई है।",
      missing_field: parsed.missing_field || null,
      latency_ms: {
        stt: sttMs,
        llm: llmMs,
        total: Date.now() - totalStart,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Voice engine error";
    console.error("Voice Engine Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}