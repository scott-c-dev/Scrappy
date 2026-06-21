import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* Speech-to-text proxy. The browser records a short clip and POSTs the raw audio
   bytes here; we forward them to Deepgram's prerecorded API with the server-side
   key (never exposed to the client) and return the transcript. */
export async function POST(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not set" },
      { status: 500 },
    );
  }

  const contentType = req.headers.get("content-type") || "audio/webm";
  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "empty audio" }, { status: 400 });
  }

  try {
    const dg = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
        body: audio,
      },
    );
    if (!dg.ok) {
      const detail = await dg.text().catch(() => "");
      throw new Error(`deepgram ${dg.status}: ${detail}`);
    }
    const data = (await dg.json()) as {
      results?: {
        channels?: { alternatives?: { transcript?: string }[] }[];
      };
    };
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[/api/transcribe]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 502 },
    );
  }
}
