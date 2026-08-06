"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoBox } from "@/components/Logo";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";

export default function Home() {
  const router = useRouter();
  const session = useSession();
  const [state] = useStored(() => ({ profile: loadProfile() }));

  useEffect(() => {
    if (session || state?.profile) router.replace("/dashboard");
  }, [session, state, router]);

  // Sunucu render'ı ya da profil varken (yönlendirme sürerken) boş dön.
  if (session === undefined || !state || state.profile) return null;

  return (
    <div className="min-h-screen text-abys-ink">
      <header className="flex items-center justify-between px-8 sm:px-16 py-8 max-w-7xl mx-auto">
        <LogoBox />
        <nav className="hidden sm:flex items-center gap-8 text-sm text-abys-ink/70">
          <a href="#how" className="hover:text-abys-ink transition-colors">
            How it works
          </a>
          <a href="#roles" className="hover:text-abys-ink transition-colors">
            For your role
          </a>
          <Link
            href="/onboarding"
            className="rounded-full bg-abys-navy text-white text-sm font-medium px-5 py-2.5 hover:bg-abys-ink transition-colors"
          >
            Get started →
          </Link>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-8 pt-16 pb-28 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-abys-accent-soft text-abys-accent text-[11px] font-semibold tracking-[0.2em] px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-abys-accent" />
          COMPANY INTELLIGENCE, DISTILLED
        </span>

        <h1 className="font-serif text-5xl sm:text-6xl leading-[1.1] mb-8 text-abys-navy">
          Run your business{" "}
          <em className="font-serif italic text-abys-accent">
            on the signals that matter.
          </em>
        </h1>

        <p className="text-abys-muted text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          ABYS is a calm operating layer for companies. Every role sees only what
          concerns them — not a dashboard for everyone, but a private briefing for
          each.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/onboarding"
            className="rounded-full bg-abys-navy text-white font-medium px-6 py-3.5 hover:bg-abys-ink transition-colors"
          >
            Begin analysis →
          </Link>
          <a
            href="#how"
            className="rounded-full border border-abys-ink/15 text-abys-ink font-medium px-6 py-3.5 hover:bg-white/60 transition-colors"
          >
            See how it works
          </a>
        </div>

        <p className="text-xs text-abys-muted mt-5">
          No setup. Pick a role, get answers in seconds.
        </p>
      </main>

      <section id="how" className="px-8 pb-28">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-abys-accent mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-abys-accent" />
            HOW IT WORKS
          </span>
          <h2 className="font-serif text-4xl mb-4 text-abys-navy">
            Three steps.{" "}
            <em className="italic text-abys-accent">
              That&rsquo;s the whole thing.
            </em>
          </h2>
          <p className="text-abys-muted mb-16">
            No setup files, no integrations to wire, no dashboards to configure.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-left">
            <Step
              n="01"
              title="Tell us your role"
              desc="CEO, Finance, HR, Operations, BizDev, or Product. The whole product adapts to what your job actually needs."
            />
            <Step
              n="02"
              title="Describe or enter numbers"
              desc="Type a scenario in plain language, or fill in the numbers form. Either works. The AI does the rest."
            />
            <Step
              n="03"
              title="Get the answer in 3 seconds"
              desc="Status, problem, action — that's it. No charts you have to read. No paragraphs to skim."
            />
          </div>
        </div>
      </section>

      <section id="roles" className="border-t border-abys-ink/10 py-24 px-8">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="font-serif text-3xl mb-2 text-abys-navy">
            Six roles.{" "}
            <em className="italic text-abys-accent">
              Six different products.
            </em>
          </h2>
          <p className="text-abys-muted mb-12">
            A single workspace where every job sees only its concerns.
          </p>
        </div>
      </section>

      <footer className="text-center text-xs text-abys-muted py-10">
        © 2026 · Company intelligence, calmly delivered
      </footer>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div>
      <p className="font-serif italic text-3xl text-abys-accent mb-3">{n}</p>
      <p className="font-semibold text-abys-navy mb-2">{title}</p>
      <p className="text-sm text-abys-muted leading-relaxed">{desc}</p>
    </div>
  );
}
