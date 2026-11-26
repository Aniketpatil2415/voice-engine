import { NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const tts = new MsEdgeTTS();
    // hi-IN-SwaraNeural (Female) ya hi-IN-MadhurNeural (Male)
    await tts.setMetadata(
      "hi-IN-MadhurNeural",
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