import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { DOMAIN_CONFIG } from "@/config/domain";

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
      return NextResponse.json(
        { error: "GROQ_API_KEY missing hai. .env.local save karke 'npm run dev' restart karo." },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey });

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const historyRaw = formData.get("history") as string | null;

    if (!audioFile || audioFile.size < 1000) {
      return NextResponse.json({
        transcript: "",
        intent: "CLARIFY",
        status: "needs_clarification",
        confidence: "low",
        card: null,
        spoken_reply: "Awaaz bahut chhoti thi, please thoda saaf boliye.",
        missing_field: "Audio clarity",
        latency_ms: { stt: 0, llm: 0, total: Date.now() - totalStart },
      });
    }

    const sttStart = Date.now();
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      language: "hi",
      prompt: DOMAIN_CONFIG.whisperContextPrompt,
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
        confidence: "low",
        card: null,
        spoken_reply: "Awaaz saaf nahi aayi, please dobara boliye.",
        missing_field: "Speech input",
        latency_ms: { stt: sttMs, llm: 0, total: Date.now() - totalStart },
      });
    }

    const llmStart = Date.now();
    let previousContext: { role: "user" | "assistant"; content: string }[] = [];
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) previousContext = parsed.slice(-4);
      } catch {
        previousContext = [];
      }
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DOMAIN_CONFIG.systemPrompt },
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
    const parsedAction = JSON.parse(cleanJson);

    return NextResponse.json({
      transcript: rawTranscript,
      intent: parsedAction.intent || "UNKNOWN",
      status: parsedAction.status || "success",
      confidence: parsedAction.confidence || "high",
      card: parsedAction.card || null,
      spoken_reply: parsedAction.spoken_reply || "Entry process ho gayi hai.",
      missing_field: parsedAction.missing_field || null,
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