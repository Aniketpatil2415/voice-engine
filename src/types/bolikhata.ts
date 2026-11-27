export interface LedgerItem {
  name: string;
  qty: string;
  price: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  type: "SALE" | "PAYMENT";
  items: LedgerItem[];
  totalAmount: number;
  paidAmount: number;
  udhaarDelta: number; // +ve increases udhaar, -ve reduces udhaar
  timestamp: string;
  rawTranscript: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  totalUdhaar: number;
  lastActivity: string;
}

export type VoiceIntent =
  | "ADD_SALE"
  | "RECORD_PAYMENT"
  | "CHECK_BALANCE"
  | "UPDATE_LAST"
  | "CLARIFY";

export interface VoiceActionResponse {
  transcript: string;
  intent: VoiceIntent;
  status: "success" | "needs_clarification" | "key_missing";
  customerName: string | null;
  items: LedgerItem[];
  totalAmount: number;
  paidAmount: number;
  udhaarDelta: number;
  spoken_reply: string;
  missing_field: string | null;
  latency_ms: {
    stt: number;
    llm: number;
    total: number;
  };
}