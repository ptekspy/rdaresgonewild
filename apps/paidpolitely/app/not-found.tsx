import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <main>
      <div className="page-bg" aria-hidden="true" />
      <Header />
      <section className="not-found">
        <p className="eyebrow">404</p>
        <h1>That page slipped out of the network.</h1>
        <p>Head back to the PaidPolitely homepage.</p>
        <a className="button button-primary" href="/">Go home</a>
      </section>
      <Footer />
    </main>
  );
}
