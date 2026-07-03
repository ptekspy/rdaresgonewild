"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LEVEL_LABELS } from "@rdgw/playbook";
import { setPlayAsUsername, usePlayAsUsername } from "@/lib/play-as";
import { normaliseUsername } from "@/lib/username";

type Message = {
  id: string;
  role: "bot" | "user";
  text: string;
};

type DareResult = {
  status: "done" | "no_dares_left";
  dare?: {
    slug: string;
    emoji: string;
    name: string;
    description: string;
    level: keyof typeof LEVEL_LABELS;
    levelOrder: number;
  };
  reason?: string;
  note?: string;
  model?: string | null;
  fallback?: boolean;
  completedCount: number;
  totalDares: number;
  eligibleCount: number;
};

const QUESTIONS = [
  "How spicy should this be: easy, medium, or wild?",
  "Where should it fit best: private, public, online, photo, video, toys, partner, or something else?",
  "Any hard limits or things I should avoid?",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function postChat(body: Record<string, unknown>) {
  const res = await fetch("/api/hero-dare-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong");
  }

  return data;
}

export function HeroDareChat() {
  const activeUsername = usePlayAsUsername();
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [questionStep, setQuestionStep] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DareResult | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "bot-start",
      role: "bot",
      text: "First, what Reddit username should I check?",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeUsername && !username && questionStep === -1) {
      setInput(`u/${activeUsername}`);
    }
  }, [activeUsername, questionStep, username]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, loading, result]);

  const placeholder = useMemo(() => {
    if (questionStep === -1) return "u/YourRedditUsername";
    if (questionStep === 0) return "Easy and private, medium, wild...";
    if (questionStep === 1) return "Private photo, online, public, toys...";
    return "No public, avoid toys, no strangers...";
  }, [questionStep]);

  function append(role: Message["role"], text: string) {
    setMessages((current) => [...current, { id: makeId(role), role, text }]);
  }

  function reset() {
    setInput(activeUsername ? `u/${activeUsername}` : "");
    setUsername("");
    setAnswers([]);
    setQuestionStep(-1);
    setLoading(false);
    setResult(null);
    setMessages([
      {
        id: "bot-start",
        role: "bot",
        text: "First, what Reddit username should I check?",
      },
    ]);
  }

  async function submitUsername(value: string) {
    const pickedUsername = normaliseUsername(value);
    const data = await postChat({ action: "validate_username", username: pickedUsername });

    setPlayAsUsername(data.username);
    setUsername(data.username);
    setQuestionStep(0);
    append("user", `u/${data.username}`);
    append("bot", QUESTIONS[0]);
    setInput("");
  }

  async function submitAnswer(value: string) {
    const answer = value.trim();
    await postChat({ action: "validate_answer", username, step: questionStep, answer });

    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);
    append("user", answer);
    setInput("");

    if (questionStep < QUESTIONS.length - 1) {
      const nextStep = questionStep + 1;
      setQuestionStep(nextStep);
      append("bot", QUESTIONS[nextStep]);
      return;
    }

    setQuestionStep(QUESTIONS.length);
    setLoading(true);
    append("bot", "I'm matching your answers to the playbook now.");

    const recommendation = (await postChat({
      action: "recommend",
      username,
      answers: nextAnswers,
    })) as DareResult;

    setResult(recommendation);
    if (recommendation.status === "done" && recommendation.dare) {
      append("bot", `I’d pick ${recommendation.dare.emoji} ${recommendation.dare.name}.`);
    } else {
      append("bot", "No matching uncompleted dares are left for that username.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !input.trim()) return;

    setLoading(true);
    try {
      if (questionStep === -1) {
        await submitUsername(input);
      } else if (questionStep >= 0 && questionStep < QUESTIONS.length) {
        await submitAnswer(input);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      append("bot", message);
    } finally {
      setLoading(false);
    }
  }

  const levelLabel = result?.dare ? LEVEL_LABELS[result.dare.level] : null;

  return (
    <div className="relative z-10 rounded-[1.5rem] border border-white/10 bg-[#090b16]/75 p-3 shadow-2xl shadow-black/25 backdrop-blur md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-pink-200">Dare chat</p>
          <p className="mt-1 text-xs text-zinc-500">3 questions, one playbook pick</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:border-pink-500/50 hover:text-white"
        >
          Reset
        </button>
      </div>

      <div className="h-[21rem] overflow-y-auto rounded-[1.15rem] border border-white/[0.08] bg-black/20 p-3">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-pink-500 text-white"
                    : "border border-white/[0.08] bg-white/[0.055] text-zinc-200"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.055] px-3.5 py-2.5 text-sm text-zinc-400">
                Thinking...
              </div>
            </div>
          )}

          {result?.status === "done" && result.dare && (
            <div className="rounded-[1.15rem] border border-pink-500/30 bg-pink-500/[0.09] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] text-3xl">
                  {result.dare.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-pink-100">
                    Level {result.dare.levelOrder}
                    {levelLabel ? ` - ${levelLabel}` : ""}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">{result.dare.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">{result.dare.description}</p>
                  {result.reason && <p className="mt-3 text-xs leading-5 text-zinc-400">{result.reason}</p>}
                  {result.note && <p className="mt-2 text-xs leading-5 text-zinc-500">{result.note}</p>}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/dares/${result.dare.level}/${result.dare.slug}`} className="rdgw-button-primary px-4 py-2 text-xs">
                  View dare
                </Link>
                <a
                  href={`https://www.reddit.com/r/daresgonewild/submit/?title=${encodeURIComponent(`${result.dare.emoji} ${result.dare.name} [Dared by the playbook]`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rdgw-button-secondary px-4 py-2 text-xs"
                >
                  Post it
                </a>
              </div>

              <p className="mt-3 text-[0.7rem] leading-5 text-zinc-500">
                Adults only. Keep it legal, consensual, and respectful of privacy.
              </p>
            </div>
          )}

          {result?.status === "no_dares_left" && (
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300">
              u/{username} has no uncompleted playbook dares left.
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={loading || questionStep >= QUESTIONS.length}
          maxLength={500}
          className="min-h-11 flex-1 rounded-full border border-white/10 bg-white/[0.055] px-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-pink-500/70 focus:ring-4 focus:ring-pink-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || questionStep >= QUESTIONS.length}
          className="rdgw-button-primary min-h-11 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
