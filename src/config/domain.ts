import { Customer, Transaction, VoiceActionResponse } from "@/types/bolikhata";

export type SupportedLang = "en" | "hi" | "mr";

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "cust-1",
    name: "Ramesh",
    phone: "919822001122",
    totalUdhaar: 450,
    lastActivity: "Today, 10:15 AM",
  },
  {
    id: "cust-2",
    name: "Suresh",
    phone: "919822003344",
    totalUdhaar: 1200,
    lastActivity: "Yesterday, 6:40 PM",
  },
  {
    id: "cust-3",
    name: "Anita",
    phone: "919822005566",
    totalUdhaar: 180,
    lastActivity: "Yesterday, 2:10 PM",
  },
  {
    id: "cust-4",
    name: "Mohan",
    phone: "919822007788",
    totalUdhaar: 0,
    lastActivity: "2 days ago",
  },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-init-1",
    customerId: "cust-1",
    customerName: "Ramesh",
    type: "SALE",
    items: [
      { name: "Wheat Flour (Atta)", qty: "5 kg", price: 250 },
      { name: "Cooking Oil", qty: "1 L", price: 200 },
    ],
    totalAmount: 450,
    paidAmount: 0,
    udhaarDelta: 450,
    timestamp: "10:15 AM",
    rawTranscript: "Add 5 kg atta 250 and 1 litre oil 200 credit to Ramesh",
  },
];

export const OFFLINE_DEMO_SCENARIOS: {
  label: string;
  response: VoiceActionResponse;
}[] = [
  {
    label: "Ramesh: 3 kg Sugar @ ₹35/kg (Marathi 'pastis' mix)",
    response: {
      transcript: "Ramesh ke khate mein 3 kilo sugar pastis rupaye kilo likh do.",
      intent: "ADD_SALE",
      status: "success",
      customerName: "Ramesh",
      items: [{ name: "Sugar", qty: "3 kg", price: 105 }],
      totalAmount: 105,
      paidAmount: 0,
      udhaarDelta: 105,
      spoken_reply: "Added 3 kg sugar for 105 rupees credit to Ramesh account.",
      missing_field: null,
      latency_ms: { stt: 410, llm: 480, total: 890 },
    },
  },
  {
    label: "Correction: Make it 4 kg sugar (₹140)",
    response: {
      transcript: "Nahi, 4 kilo sugar kar do.",
      intent: "UPDATE_LAST",
      status: "success",
      customerName: "Ramesh",
      items: [{ name: "Sugar", qty: "4 kg", price: 140 }],
      totalAmount: 140,
      paidAmount: 0,
      udhaarDelta: 140,
      spoken_reply: "Updated Ramesh entry to 4 kg sugar for 140 rupees.",
      missing_field: null,
      latency_ms: { stt: 360, llm: 450, total: 810 },
    },
  },
  {
    label: "Payment: Suresh paid ₹500 cash",
    response: {
      transcript: "Suresh ne 500 rupaye jama kar diye.",
      intent: "RECORD_PAYMENT",
      status: "success",
      customerName: "Suresh",
      items: [],
      totalAmount: 500,
      paidAmount: 500,
      udhaarDelta: -500,
      spoken_reply: "Recorded 500 rupees payment for Suresh.",
      missing_field: null,
      latency_ms: { stt: 340, llm: 420, total: 760 },
    },
  },
  {
    label: "Query: How much does Suresh owe?",
    response: {
      transcript: "Suresh ka kitna baaki hai?",
      intent: "CHECK_BALANCE",
      status: "success",
      customerName: "Suresh",
      items: [],
      totalAmount: 0,
      paidAmount: 0,
      udhaarDelta: 0,
      spoken_reply: "Showing Suresh pending balance on screen.",
      missing_field: null,
      latency_ms: { stt: 300, llm: 380, total: 680 },
    },
  },
];

export interface UILocale {
  code: SupportedLang;
  label: string;
  nativeLabel: string;
  subtitle: string;
  kpiUdhaar: string;
  kpiCash: string;
  kpiCustomers: string;
  demoBtn: string;
  demoBannerTitle: string;
  demoBannerSub: string;
  idleHeadline: string;
  tryPrefix: string;
  sampleCommand: string;
  listeningText: string;
  processingText: string;
  speakBtn: string;
  stopBtn: string;
  recentEntries: string;
  entriesCount: string;
  customerKhata: string;
  saleTag: string;
  paidTag: string;
  whatsappBtn: string;
  dueLabel: string;
  clearLabel: string;
  micError: string;
  replyInstruction: string;
}

export const UI_TEXT: Record<SupportedLang, UILocale> = {
  en: {
    code: "en",
    label: "EN",
    nativeLabel: "English",
    subtitle: "Voice Kirana Ledger",
    kpiUdhaar: "Total Pending Credit",
    kpiCash: "Today's Cash Collected",
    kpiCustomers: "Total Customers",
    demoBtn: "Demo",
    demoBannerTitle: "Offline Judge Demo Simulator (Works without API Key)",
    demoBannerSub: "1-Click Test",
    idleHeadline: "Speak in any language — Hindi, Marathi, or English.",
    tryPrefix: "Try:",
    sampleCommand: "“Ramesh 3 kg sugar 35 rupees per kg credit”",
    listeningText: "Listening... auto-stops when you finish speaking",
    processingText: "Calculating and updating ledger...",
    speakBtn: "SPEAK",
    stopBtn: "STOP",
    recentEntries: "Recent Entries",
    entriesCount: "entries",
    customerKhata: "Customer Ledger",
    saleTag: "SALE",
    paidTag: "PAID",
    whatsappBtn: "WhatsApp Bill",
    dueLabel: "Due",
    clearLabel: "Settled",
    micError: "Microphone permission denied. Please allow mic access.",
    replyInstruction:
      "Warm, concise 1-sentence confirmation in natural Indian English (under 15 words). Example: 'Done, added 105 rupees credit to Ramesh account.'",
  },
  hi: {
    code: "hi",
    label: "HI",
    nativeLabel: "हिन्दी",
    subtitle: "बोलने वाला किराना खाता",
    kpiUdhaar: "कुल उधार बाकी",
    kpiCash: "आज की नकद वसूली",
    kpiCustomers: "कुल ग्राहक",
    demoBtn: "डेमो",
    demoBannerTitle: "ऑफलाइन डेमो सिमुलेटर (बिना API Key के चलता है)",
    demoBannerSub: "1-क्लिक टेस्ट",
    idleHeadline: "किसी भी भाषा में बोलें — हिन्दी, मराठी या इंग्लिश।",
    tryPrefix: "उदाहरण:",
    sampleCommand: "“रमेश के खाते में 3 किलो चीनी 35 रुपये किलो उधार लिख दो”",
    listeningText: "सुन रहा हूँ... बोलना खत्म होते ही अपने-आप रुकेगा",
    processingText: "हिसाब जोड़कर खाता अपडेट कर रहा हूँ...",
    speakBtn: "बोलें",
    stopBtn: "रोकें",
    recentEntries: "ताज़ा लेन-देन",
    entriesCount: "एंट्री",
    customerKhata: "ग्राहक खाता बही",
    saleTag: "बिक्री",
    paidTag: "जमा",
    whatsappBtn: "WhatsApp पर्ची",
    dueLabel: "बाकी",
    clearLabel: "साफ़",
    micError: "माइक की परमिशन नहीं मिली। ब्राउज़र में Mic Allow करें।",
    replyInstruction:
      "Warm, natural 1-sentence confirmation in conversational Devanagari Hindi (under 15 words). Example: 'जी, रमेश के खाते में 105 रुपये उधार जोड़ दिया है।'",
  },
  mr: {
    code: "mr",
    label: "MR",
    nativeLabel: "मराठी",
    subtitle: "बोलणारे किराणा खाते",
    kpiUdhaar: "एकूण उधार बाकी",
    kpiCash: "आजची रोख वसुली",
    kpiCustomers: "एकूण ग्राहक",
    demoBtn: "डेमो",
    demoBannerTitle: "ऑफलाइन डेमो सिम्युलेटर (API Key शिवाय चालते)",
    demoBannerSub: "1-क्लिक टेस्ट",
    idleHeadline: "कोणत्याही भाषेत बोला — मराठी, हिन्दी किंवा इंग्लिश.",
    tryPrefix: "उदाहरण:",
    sampleCommand: "“रमेशच्या खात्यात 3 किलो साखर पस्तीस रुपये किलो लिहून ठेव”",
    listeningText: "ऐकत आहे... बोलणे संपल्यावर आपोआप थांबेल",
    processingText: "हिशोब करून खाते अपडेट करत आहे...",
    speakBtn: "बोला",
    stopBtn: "थांबा",
    recentEntries: "ताजे व्यवहार",
    entriesCount: "नोंदी",
    customerKhata: "ग्राहक खातेवही",
    saleTag: "विक्री",
    paidTag: "जमा",
    whatsappBtn: "WhatsApp पावती",
    dueLabel: "बाकी",
    clearLabel: "पूर्ण",
    micError: "माइकची परवानगी मिळाली नाही. कृपया ब्राउझरमध्ये Allow करा.",
    replyInstruction:
      "Warm, natural 1-sentence confirmation in conversational Devanagari Marathi (under 15 words). Example: 'हो, रमेशच्या खात्यात 105 रुपये उधार लिहिले आहेत.'",
  },
};

export const BOLIKHATA_CONFIG = {
  appName: "VOXLEDGER",
  multilingualWhisperPrompt:
    "Ramesh, Suresh, Anita, Mohan, sugar, sakhar, chini, atta, oil, milk, kilo, kg, litre, rupees, rupaye, udhaar, credit, cash, jama, baaki, pastis 35, panchvis 25, chalis 40, pannas 50, saath 60, sattar 70, navvad 90, dedh sau 150.",
  getSystemPrompt: (existingCustomerNames: string[], uiLang: SupportedLang) => `You are VoxLedger, an ultra-fast voice-first ledger engine for Indian retail shopkeepers.
IMPORTANT: The shopkeeper can speak in ANY mix of Hindi, Marathi, English, or Hinglish/Minglish (code-switching). NEVER reject mixed-language input!
App UI Display Language: ${UI_TEXT[uiLang].nativeLabel} (${uiLang}). Output item names and spoken_reply in ${UI_TEXT[uiLang].nativeLabel}.
Existing customers in ledger: ${existingCustomerNames.join(", ")}.
Always match spoken customer names to existing customer names if phonetically close (e.g., "रमेश" or "Ramesh" -> match existing name exactly).

CRITICAL INDIAN NUMBER & MATH RULES:
1. Understand Marathi & Hindi spoken numbers accurately:
   - Marathi: ek(1), don(2), teen(3), paach(5), daha(10), vis(20), panchvis(25), tis(30), pastis(35), chalis(40), pannas(50), saath(60), sattar(70), ainshi(80), navvad(90), shambhar(100), didshe(150), donshe(200).
   - Hindi: dedh(1.5), dhai/adhai(2.5), savva(1.25), paune(0.75), paitis/pastis(35), pachees(25), pachas(50), nabbe(90).
2. UNIT-RATE MULTIPLICATION: If the user specifies a per-unit rate (e.g., "3 kilo sugar 35 rupaye kilo" or "3 kg sugar pastis rupaye kilo"), you MUST multiply: price = 3 * 35 = 105! Do NOT just write 35.
3. If the user specifies a total price (e.g., "2 kilo sugar 90 rupees"), price = 90.

Return STRICT JSON ONLY matching this exact schema:
{
  "intent": "ADD_SALE | RECORD_PAYMENT | CHECK_BALANCE | UPDATE_LAST | CLARIFY",
  "status": "success | needs_clarification",
  "customerName": "Matched customer name or null",
  "items": [
    { "name": "Item name in ${UI_TEXT[uiLang].nativeLabel}", "qty": "e.g. 3 kg", "price": 105 }
  ],
  "totalAmount": 105,
  "paidAmount": 0,
  "udhaarDelta": 105,
  "missing_field": null or "string",
  "spoken_reply": "${UI_TEXT[uiLang].replyInstruction}"
}

Intent Rules:
- ADD_SALE: totalAmount = sum of item prices. udhaarDelta = totalAmount - paidAmount.
- RECORD_PAYMENT: items = [], totalAmount = paidAmount, udhaarDelta = -paidAmount (negative).
- CHECK_BALANCE: udhaarDelta = 0.
- UPDATE_LAST: Use conversation history to output complete corrected items, totalAmount, paidAmount, udhaarDelta.
- CLARIFY: Only if customer name or amount is genuinely missing.
Never output markdown or text outside JSON.`,
};