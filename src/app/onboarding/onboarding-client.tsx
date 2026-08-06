"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SECTORS, type SectorId } from "@/lib/sectors";
import { ROLES, type RoleId } from "@/lib/roles";
import { saveProfile } from "@/lib/profile";

type Step = 1 | 2 | 3;

export default function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState("");
  const [sectorId, setSectorId] = useState<SectorId | null>(null);
  const [roleId, setRoleId] = useState<RoleId | null>(null);

  function finish(finalRoleId: RoleId) {
    if (!sectorId) return;
    saveProfile({ companyName: companyName.trim(), sectorId, roleId: finalRoleId });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-24 px-8">
      <div className="w-full max-w-2xl">
        <Stepper step={step} />

        {step === 1 && (
          <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
              ADIM 01 · KURULUM
            </p>
            <h1 className="font-serif text-4xl text-abys-navy mb-3">
              <em className="italic text-abys-accent">Şirketinizi</em> tanıyalım.
            </h1>
            <p className="text-abys-muted mb-8">
              Üç adımlı kurulum. Her şeyi sizin için kişiselleştireceğiz.
            </p>

            <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
              ŞİRKET ADI
            </label>
            <input
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && companyName.trim()) setStep(2);
              }}
              placeholder="Şirket adınızı yazın"
              className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 text-abys-ink placeholder:text-abys-muted focus:outline-none focus:ring-2 focus:ring-abys-accent mb-8"
            />

            <div className="flex justify-end">
              <button
                disabled={!companyName.trim()}
                onClick={() => setStep(2)}
                className="rounded-full bg-abys-navy text-white font-medium px-6 py-3 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Devam →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
              ADIM 02 · KURULUM
            </p>
            <h1 className="font-serif text-4xl text-abys-navy mb-3">
              Hangi <em className="italic text-abys-accent">sektörde</em> çalışıyorsunuz?
            </h1>
            <p className="text-abys-muted mb-8">
              Platform, sektörünüze göre risk modelini ve veri setlerini ayarlayacak.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {SECTORS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectorId(s.id)}
                  className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
                    sectorId === s.id
                      ? "border-abys-accent bg-abys-cream ring-2 ring-abys-accent"
                      : "border-abys-cream-border bg-abys-cream hover:border-abys-accent/50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg leading-none mt-0.5">{s.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-abys-navy">{s.label}</p>
                      <p className="text-xs text-abys-muted">{s.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-abys-muted hover:text-abys-ink"
              >
                ← GERİ
              </button>
              <button
                disabled={!sectorId}
                onClick={() => setStep(3)}
                className="rounded-full bg-abys-navy text-white font-medium px-6 py-3 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Devam →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
              ADIM 03 · KURULUM
            </p>
            <h1 className="font-serif text-4xl text-abys-navy mb-3">
              Rolünüzü <em className="italic text-abys-accent">seçin</em>.
            </h1>
            <p className="text-abys-muted mb-8">
              Her ekran ve analiz seçtiğiniz role göre şekillenecek.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRoleId(r.id)}
                  className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
                    roleId === r.id
                      ? "border-abys-accent bg-abys-cream ring-2 ring-abys-accent"
                      : "border-abys-cream-border bg-abys-cream hover:border-abys-accent/50"
                  }`}
                >
                  <p className="font-semibold text-sm text-abys-navy">{r.label}</p>
                  <p className="text-xs text-abys-muted">{r.tagline}</p>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-abys-muted hover:text-abys-ink"
              >
                ← GERİ
              </button>
              <button
                disabled={!roleId}
                onClick={() => roleId && finish(roleId)}
                className="rounded-full bg-abys-navy text-white font-medium px-6 py-3 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Başla →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-center mb-10 max-w-md">
      <StepDot n={1} step={step} />
      <StepLine done={step > 1} />
      <StepDot n={2} step={step} />
      <StepLine done={step > 2} />
      <StepDot n={3} step={step} />
    </div>
  );
}

function StepDot({ n, step }: { n: number; step: Step }) {
  const done = step > n;
  const active = step === n;
  return (
    <div
      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
        done || active
          ? "bg-abys-navy text-white"
          : "bg-abys-ink/10 text-abys-muted"
      }`}
    >
      {done ? "✓" : n}
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div
      className={`h-px flex-1 mx-2 ${done ? "bg-abys-accent" : "bg-abys-ink/15"}`}
    />
  );
}
