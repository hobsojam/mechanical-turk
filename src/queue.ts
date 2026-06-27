import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export interface QuestionSummary {
  id: string;
  question: string;
  agentId: string;
  timestamp: string;
}

interface PendingQuestion extends QuestionSummary {
  resolve: (answer: string) => void;
  reject: (reason: Error) => void;
}

class QuestionQueue extends EventEmitter {
  private pending = new Map<string, PendingQuestion>();

  add(question: string, agentId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const entry: PendingQuestion = {
        id,
        question,
        agentId,
        timestamp: new Date().toISOString(),
        resolve,
        reject,
      };
      this.pending.set(id, entry);
      this.emit("question", this.summarize(entry));
    });
  }

  answer(id: string, answer: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    entry.resolve(answer);
    this.pending.delete(id);
    this.emit("answered", { id, answer, agentId: entry.agentId });
    return true;
  }

  // Reject all pending questions from a given agent (e.g. on disconnect)
  rejectByAgent(agentId: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.agentId === agentId) {
        entry.reject(new Error("Agent disconnected"));
        this.pending.delete(id);
        this.emit("dropped", { id, agentId });
      }
    }
  }

  getAll(): QuestionSummary[] {
    return Array.from(this.pending.values()).map(this.summarize);
  }

  private summarize(entry: PendingQuestion): QuestionSummary {
    const { id, question, agentId, timestamp } = entry;
    return { id, question, agentId, timestamp };
  }
}

export const queue = new QuestionQueue();
