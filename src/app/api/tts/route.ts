import { NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const VOICE_MAP: Record<string, string> = {
  hi: "hi-IN-MadhurNeural",
  mr: "mr-IN-ManoharNeural",
  en: "en-IN-PrabhatNeural",
};

export async function POST(req: Request) {
  try {
    const { text, lang = "hi" } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const selectedVoice = VOICE_MAP[lang] || VOICE_MAP.hi;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      selectedVoice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];

    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "TTS failed";
    console.error("TTS Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}