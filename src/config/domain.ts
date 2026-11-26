export interface ActionCardData {
  title: string;
  subtitle: string;
  fields: { label: string; value: string; highlight?: boolean }[];
  primaryActionLabel?: string;
}

export interface VoiceEngineResponse {
  transcript: string;
  intent: string;
  status: "success" | "needs_clarification" | "error";
  confidence: "high" | "medium" | "low";
  card: ActionCardData | null;
  spoken_reply: string;
  missing_field: string | null;
  latency_ms: {
    stt: number;
    llm: number;
    total: number;
  };
}

export const DOMAIN_CONFIG = {
  appName: "BharatVoice Core",
  tagline: "Universal Voice-First Action Engine • Hinglish, Hindi & Marathi Ready",
  whisperContextPrompt:
    "Indian speaker mixing Hindi, Marathi, and English (Hinglish). Common words: rupay, kilo, udhaar, khata, complaint, appointment, bill, number, cancel, confirm, नमस्ते, नहीं, चीनी, किलो, ग्राम, लीटर, रुपये, उधार, खाते में, लिख दो, कर दो, हटा दो, कैंसिल, कंफर्म, बिल, रमेश, सुरेश.",
  sampleCommands: [
    "Ramesh ke khate mein 2 kilo chini 90 rupay udhaar likh do",
    "Nahi, chini 3 kilo 135 rupay kar do",
    "Mere area mein 3 din se paani nahi aa raha, complaint file karo",
  ],
  systemPrompt: `You are BharatVoice Core, an ultra-fast voice-to-action AI engine for India.
Users speak in Hindi, Marathi, English, or Hinglish with accents and filler words.
Your job is to understand their intent, handle corrections (using conversation history), and return STRICT JSON ONLY.

JSON Schema:
{
  "intent": "CREATE_ENTRY | UPDATE_LAST | QUERY | CLARIFY | UNKNOWN",
  "status": "success" | "needs_clarification",
  "confidence": "high" | "medium" | "low",
  "missing_field": null or "string describing what single info is missing",
  "spoken_reply": "Short, natural 1-sentence confirmation or question in conversational Devanagari Hindi (NEVER Roman/English letters, so Hindi TTS pronounces it cleanly). Example: 'रमेश के खाते में 3 किलो चीनी 135 रुपये अपडेट कर दिया है।' Keep under 15 words.",
  "card": {
    "title": "Short clean title for the action",
    "subtitle": "Category or context",
    "fields": [
      { "label": "Key name", "value": "Extracted value", "highlight": false }
    ],
    "primaryActionLabel": "Confirm & Execute"
  }
}

Rules:
1. If the user says something like "nahi 2 nahi 3 kar do", use the previous message context and return intent "UPDATE_LAST" with corrected fields.
2. If critical info (like amount, name, or main detail) is missing or unclear, set status to "needs_clarification", set "missing_field", and ask ONE short voice question in "spoken_reply".
3. Never output markdown or text outside the JSON object.`,
};