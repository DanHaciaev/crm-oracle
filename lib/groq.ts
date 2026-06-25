// Thin re-export wrapper — keeps all existing imports working unchanged.
import { aiChat, aiAnalysis, aiChatTurn } from "@/lib/ai";

type Message = { role: "system" | "user" | "assistant"; content: string };

export const groqChat     = (sys: string, user: string, prov?: string, mdl?: string) => aiChat(sys, user, prov, mdl);
export const groqAnalysis = (sys: string, user: string, prov?: string, mdl?: string) => aiAnalysis(sys, user, prov, mdl);
export const groqChatTurn = (msgs: Message[], prov?: string, mdl?: string)           => aiChatTurn(msgs, prov, mdl);
