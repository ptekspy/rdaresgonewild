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
    count: PLAYBOOK_DARES.filter((d: { level: string }) => d.level === key).length,
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">🎲 Pick My Next Dare</h1>
        <p className="text-zinc-400 text-sm">
          Enter your Reddit username and we'll suggest the next dare you haven't completed yet.
        </p>
      </div>

      <DarePickerClient
        totalDares={totalDares}
        levelNames={levelNames}
        requirementOptions={[...DARE_REQUIREMENT_OPTIONS]}
      />

      <AdSlot slotKey="dare_picker_sidebar" />
    </div>
  );
}
