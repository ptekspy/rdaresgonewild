import type { Metadata } from "next";
import { DarePickerClient } from "./DarePickerClient";
import { AdSlot } from "@/components/AdSlot";
import { DARE_REQUIREMENT_OPTIONS, LEVEL_LABELS, PLAYBOOK_DARES } from "@rdgw/playbook";

export const metadata: Metadata = { title: "Pick a Dare" };

export default function DarePickerPage() {
  const totalDares = PLAYBOOK_DARES.length;
  const levelNames = Object.entries(LEVEL_LABELS).map(([key, label]) => ({
    key,
    label,
    count: PLAYBOOK_DARES.filter((dare: { level: string }) => dare.level === key).length,
  }));

  return (
    <div className="rdgw-page-shell max-w-4xl py-10 space-y-8">
      <section className="rdgw-card-strong rdgw-glow-border overflow-hidden p-6 text-center sm:p-8">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.04]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/rdgw-flame-icon-color.png" alt="" aria-hidden="true" className="h-24 w-auto" />
        </div>
        <span className="rdgw-kicker">Dare picker</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
          Pick your <span className="rdgw-gradient-text">next challenge</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          Enter a Reddit username, choose your level range, and get a playbook dare they have not completed yet.
        </p>
      </section>

      <DarePickerClient
        totalDares={totalDares}
        levelNames={levelNames}
        requirementOptions={[...DARE_REQUIREMENT_OPTIONS]}
      />

      <AdSlot slotKey="dare_picker_sidebar" />
    </div>
  );
}
