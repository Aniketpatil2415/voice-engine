import { Customer, Transaction, VoiceActionResponse } from "@/types/bolikhata";

export type SupportedLang = "hi" | "mr" | "en";

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "cust-1",
    name: "रमेश",
    phone: "919822001122",
    totalUdhaar: 450,
    lastActivity: "आज, सुबह 10:15",
  },
  {
    id: "cust-2",
    name: "सुरेश",
    phone: "919822003344",
    totalUdhaar: 1200,
    lastActivity: "कल, शाम 6:40",
  },
  {
    id: "cust-3",
    name: "अनीता",
    phone: "919822005566",
    totalUdhaar: 180,
    lastActivity: "कल, दोपहर 2:10",
  },
  {
    id: "cust-4",
    name: "मोहन",
    phone: "919822007788",
    totalUdhaar: 0,
    lastActivity: "2 दिन पहले",
  },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-init-1",
    customerId: "cust-1",
    customerName: "रमेश",
    type: "SALE",
    items: [
      { name: "आटा", qty: "5 किलो", price: 250 },
      { name: "तेल", qty: "1 लीटर", price: 200 },
    ],
    totalAmount: 450,
    paidAmount: 0,
    udhaarDelta: 450,
    timestamp: "10:15 AM",
    rawTranscript: "रमेश के खाते में 5 किलो आटा 250 और 1 लीटर तेल 200 उधार लिख दो",
  },
];

export const OFFLINE_DEMO_SCENARIOS: {
  label: string;
  response: VoiceActionResponse;
}[] = [
  {
    label: "रमेश: 2 किलो चीनी ₹90 + तेल ₹160 (₹100 कैश)",
    response: {
      transcript:
        "रमेश के खाते में 2 किलो चीनी 90 रुपये और 1 लीटर तेल 160 रुपये डाल दो, 100 कैश दिया बाकी उधार।",
      intent: "ADD_SALE",
      status: "success",
      customerName: "रमेश",
      items: [
        { name: "चीनी", qty: "2 किलो", price: 90 },
        { name: "तेल", qty: "1 लीटर", price: 160 },
      ],
      totalAmount: 250,
      paidAmount: 100,
      udhaarDelta: 150,
      spoken_reply: "जी, रमेश के खाते में 150 रुपये उधार जोड़ दिया है।",
      missing_field: null,
      latency_ms: { stt: 410, llm: 520, total: 930 },
    },
  },
  {
    label: "सुधार: नहीं, चीनी 3 किलो ₹135 कर दो",
    response: {
      transcript: "नहीं, चीनी 3 किलो 135 रुपये कर दो।",
      intent: "UPDATE_LAST",
      status: "success",
      customerName: "रमेश",
      items: [
        { name: "चीनी", qty: "3 किलो", price: 135 },
        { name: "तेल", qty: "1 लीटर", price: 160 },
      ],
      totalAmount: 295,
      paidAmount: 100,
      udhaarDelta: 195,
      spoken_reply: "ठीक है, रमेश की एंट्री अपडेट हो गई, अब 195 रुपये उधार है।",
      missing_field: null,
      latency_ms: { stt: 380, llm: 490, total: 870 },
    },
  },
  {
    label: "जमा: सुरेश ने ₹500 जमा कर दिए",
    response: {
      transcript: "सुरेश ने 500 रुपये जमा कर दिए।",
      intent: "RECORD_PAYMENT",
      status: "success",
      customerName: "सुरेश",
      items: [],
      totalAmount: 500,
      paidAmount: 500,
      udhaarDelta: -500,
      spoken_reply: "बढ़िया, सुरेश के खाते में 500 रुपये जमा कर दिए हैं।",
      missing_field: null,
      latency_ms: { stt: 350, llm: 440, total: 790 },
    },
  },
  {
    label: "पूछताछ: सुरेश का कितना बाकी है?",
    response: {
      transcript: "सुरेश का कितना बाकी है?",
      intent: "CHECK_BALANCE",
      status: "success",
      customerName: "सुरेश",
      items: [],
      totalAmount: 0,
      paidAmount: 0,
      udhaarDelta: 0,
      spoken_reply: "सुरेश के खाते का पूरा हिसाब स्क्रीन पर दिखा दिया है।",
      missing_field: null,
      latency_ms: { stt: 310, llm: 390, total: 700 },
    },
  },
];

export const LANG_META: Record<
  SupportedLang,
  {
    code: SupportedLang;
    label: string;
    nativeLabel: string;
    whisperPrompt: string;
    replyInstruction: string;
    sampleCommand: string;
    idleHeadline: string;
  }
> = {
  hi: {
    code: "hi",
    label: "HI",
    nativeLabel: "हिन्दी",
    whisperPrompt:
      "नमस्ते, रमेश, सुरेश, अनीता, मोहन, चीनी, आटा, तेल, दूध, चावल, किलो, लीटर, रुपये, उधार, कैश, जमा, बाकी, खाते में, लिख दो, नहीं, कर दो।",
    replyInstruction:
      "Warm, natural 1-sentence confirmation in conversational Devanagari Hindi with natural comma pause (under 15 words). Example: 'जी, रमेश के खाते में 150 रुपये उधार जोड़ दिया है।'",
    sampleCommand: "“रमेश के खाते में 2 किलो चीनी 90 रुपये उधार लिख दो”",
    idleHeadline: "बोलो, खाता तुरंत अपडेट होगा।",
  },
  mr: {
    code: "mr",
    label: "MR",
    nativeLabel: "मराठी",
    whisperPrompt:
      "नमस्कार, रमेश, सुरेश, अनीता, मोहन, साखर, पीठ, तेल, दूध, तांदूळ, किलो, लिटर, रुपये, उधार, रोख, जमा, बाकी, खात्यात, लिहून ठेव, नाही, कर।",
    replyInstruction:
      "Warm, natural 1-sentence confirmation in conversational Devanagari Marathi with natural comma pause (under 15 words). Example: 'हो, रमेशच्या खात्यात 150 रुपये उधार लिहिले आहेत.'",
    sampleCommand: "“रमेशच्या खात्यात 2 किलो साखर 90 रुपये उधार लिहून ठेव”",
    idleHeadline: "बोला, खाते लगेच अपडेट होईल.",
  },
  en: {
    code: "en",
    label: "EN",
    nativeLabel: "English",
    whisperPrompt:
      "Ramesh, Suresh, Anita, Mohan, sugar, flour, oil, milk, rice, kg, litre, rupees, credit, udhaar, cash, paid, balance, add, update.",
    replyInstruction:
      "Warm, natural 1-sentence confirmation in crisp Indian English (under 15 words). Example: 'Done, added 150 rupees credit to Ramesh account.'",
    sampleCommand: "“Add 2 kg sugar 90 rupees credit to Ramesh account”",
    idleHeadline: "Speak. Your ledger updates instantly.",
  },
};

export const BOLIKHATA_CONFIG = {
  appName: "VOXLEDGER",
  tagline: "Zero-Typing Voice Ledger • HI · MR · EN",
  getSystemPrompt: (existingCustomerNames: string[], lang: SupportedLang) => `You are VoxLedger, an ultra-fast voice-first ledger engine for Indian retail shopkeepers.
Active language: ${LANG_META[lang].nativeLabel} (${lang}).
Existing customers in ledger: ${existingCustomerNames.join(", ")}.
Match spoken customer names to existing names if phonetically close (e.g., "Ramesh" -> "रमेश").

Return STRICT JSON ONLY matching this exact schema:
{
  "intent": "ADD_SALE | RECORD_PAYMENT | CHECK_BALANCE | UPDATE_LAST | CLARIFY",
  "status": "success | needs_clarification",
  "customerName": "Matched customer name or null",
  "items": [
    { "name": "Item name", "qty": "e.g. 2 kg / 2 किलो", "price": 90 }
  ],
  "totalAmount": 250,
  "paidAmount": 100,
  "udhaarDelta": 150,
  "missing_field": null or "string",
  "spoken_reply": "${LANG_META[lang].replyInstruction}"
}

Rules:
1. ADD_SALE: totalAmount = sum of item prices. udhaarDelta = totalAmount - paidAmount.
2. RECORD_PAYMENT: items = [], totalAmount = paidAmount, udhaarDelta = -paidAmount (negative).
3. CHECK_BALANCE: udhaarDelta = 0.
4. UPDATE_LAST: Use history to output complete corrected items, totalAmount, paidAmount, udhaarDelta.
5. CLARIFY: If customer name or amount is missing, set status = "needs_clarification".
Never output markdown or text outside JSON.`,
};