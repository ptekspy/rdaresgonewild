import Image from "next/image";
import { siteConfig } from "@/lib/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <Image src="/brand/paidpolitely-mark.svg" width={34} height={34} alt="" />
        <span>PaidPolitely</span>
      </div>
      <p>Direct adult display ads and subreddit companion sites.</p>
      <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
    </footer>
  );
}
