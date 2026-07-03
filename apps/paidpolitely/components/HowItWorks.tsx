import { SectionShell } from "./SectionShell";

const advertiserSteps = [
  "Tell us your brand, budget, target audience, and dates.",
  "We match you to fitting community sites and placements.",
  "Your creative runs with sponsored labelling, click tracking, and simple reporting.",
];

const subredditSteps = [
  "Share the subreddit, rules, culture, and repeated post patterns.",
  "We shape a companion site around what the community already does.",
  "If it proves useful, it can join the wider ad network with clean sponsor slots.",
];

function StepList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <article className="steps-card">
      <h3>{title}</h3>
      <ol>
        {steps.map((step, index) => (
          <li key={step}><span>{index + 1}</span>{step}</li>
        ))}
      </ol>
    </article>
  );
}

export function HowItWorks() {
  return (
    <SectionShell
      eyebrow="How it works"
      title="A direct network for people who already understand Reddit communities."
      intro="PaidPolitely is built around private conversations, useful community sites, and targeted adult-safe sponsorships."
    >
      <div className="steps-grid">
        <StepList title="Advertisers" steps={advertiserSteps} />
        <StepList title="Subreddits" steps={subredditSteps} />
      </div>
    </SectionShell>
  );
}
