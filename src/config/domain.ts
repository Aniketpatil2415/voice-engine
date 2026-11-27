import { Customer, Transaction, VoiceActionResponse } from "@/types/bolikhata";

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

// Used automatically when GROQ_API_KEY is not set (Zero-Key Judge Testing)
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
      spoken_reply: "रमेश के खाते में 150 रुपये उधार जोड़ दिया है।",
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
      spoken_reply: "रमेश की एंट्री अपडेट हो गई, अब 195 रुपये उधार है।",
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
      spoken_reply: "सुरेश के खाते से 500 रुपये जमा कर दिए हैं।",
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

export const BOLIKHATA_CONFIG = {
  appName: "BOLIKHATA",
  tagline: "Voice-First Kirana Ledger • Zero Typing",
  whisperContextPrompt:
    "नमस्ते, रमेश, सुरेश, अनीता, मोहन, चीनी, आटा, तेल, दूध, चावल, किलो, ग्राम, लीटर, रुपये, उधार, कैश, जमा, बाकी, खाते में, लिख दो, नहीं, कर दो, कितना बाकी है।",
  getSystemPrompt: (existingCustomerNames: string[]) => `You are BoliKhata, an ultra-fast voice-first ledger engine for Indian kirana shopkeepers.
Existing customers in ledger: ${existingCustomerNames.join(", ")}.
Always match spoken names to existing customer names in Devanagari if phonetically close (e.g., "Ramesh" -> "रमेश"). If it's a new customer, write their name cleanly in Devanagari.

Return STRICT JSON ONLY matching this exact schema:
{
  "intent": "ADD_SALE | RECORD_PAYMENT | CHECK_BALANCE | UPDATE_LAST | CLARIFY",
  "status": "success | needs_clarification",
  "customerName": "Devanagari name or null",
  "items": [
    { "name": "Item name in Devanagari", "qty": "e.g. 2 किलो", "price": 90 }
  ],
  "totalAmount": 250,
  "paidAmount": 100,
  "udhaarDelta": 150,
  "missing_field": null or "string",
  "spoken_reply": "Short, natural 1-sentence confirmation in conversational Devanagari Hindi (under 15 words, NEVER formal textbook Hindi)."
}

Math & Intent Rules:
1. ADD_SALE: Calculate totalAmount = sum of item prices. If user says "100 cash diya baaki udhaar", paidAmount = 100, udhaarDelta = totalAmount - paidAmount. If nothing paid, paidAmount = 0, udhaarDelta = totalAmount.
2. RECORD_PAYMENT: When customer pays back ("रमेश ने 200 जमा किए"), items = [], totalAmount = 200, paidAmount = 200, udhaarDelta = -200 (negative!).
3. CHECK_BALANCE: When shopkeeper asks ("रमेश का कितना बाकी है?"), set intent = "CHECK_BALANCE", udhaarDelta = 0.
4. UPDATE_LAST: When user corrects previous entry ("नहीं चीनी 3 किलो 135 रुपये कर दो"), use conversation history to output the COMPLETE corrected items, totalAmount, paidAmount, and udhaarDelta.
5. CLARIFY: If customer name or amount is missing for a sale/payment, set status = "needs_clarification", missing_field = what's missing, and ask ONE short question in spoken_reply.
Never output markdown or text outside JSON.`,
};