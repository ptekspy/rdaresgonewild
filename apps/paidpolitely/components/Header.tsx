import { buildMailto } from "@/lib/site";
import { Wordmark } from "./Brand";

export function Header() {
  return (
    <header className="site-header">
      <a aria-label="PaidPolitely home" href="#top">
        <Wordmark />
      </a>
      <nav aria-label="Primary navigation">
        <a href="#advertise">Advertise</a>
        <a href="#subreddits">Subreddits</a>
        <a href="#network">Network</a>
        <a className="nav-cta" href={buildMailto("advertiser")}>Book ads</a>
      </nav>
    </header>
  );
}
