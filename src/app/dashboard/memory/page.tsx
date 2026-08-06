"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { useSession } from "@/lib/use-session";
import { SEVERITY_META } from "@/lib/signals";
import {
  type DecisionRecord,
  type AuditEvent,
  type OutcomeResult,
  listDecisions,
  saveDecision,
  listAudit,
  logAudit,
  outcomeLabel,
  CHOICE_META,
  AUDIT_TYPE_META,
} from "@/lib/decisions";

type Tab = "decisions" | "audit" | "documents";

export default function MemoryPage() {
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const [tab, setTab] = useState<Tab>("decisions");
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (isTais) return;
    refresh();
  }, [isTais]);

  function refresh() {
    const p = loadProfile();
    setRecords(listDecisions(p?.sectorId));
    setAudit(listAudit());
  }

  const stats = useMemo(() => {
    const total = records.length;
    const accepted = records.filter((r) => r.choice === "accepted").length;
    const withOutcome = records.filter((r) => r.outcome);
    const improved = withOutcome.filter((r) => r.outcome!.result === "improved").length;
    return {
      total,
      acceptanceRate: total ? Math.round((accepted / total) * 100) : 0,
      outcomeCount: withOutcome.length,
      successRate: withOutcome.length ? Math.round((improved / withOutcome.length) * 100) : 0,
    };
  }, [records]);

  if (isTais) return <TaisMemoryView />;

  return (
    <div>
      <PageHeader
        eyebrow="KURUMSAL HAFIZA"
        title="Karar geçmişi ve"
        accent="denetim günlüğü."
        desc="ABYS her öneriyi, her kararı ve her sonucu kaydeder. Sistemi değiştirmek bir yazılımı değiştirmek değil, kurumun karar hafızasını kaybetmek anlamına gelir — bu sayfa o hafızadır."
      />

      <div className="px-10 pb-16 max-w-4xl space-y-6">
        {/* İstatistikler */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Toplam karar" value={String(stats.total)} />
          <StatCard label="Öneri kabul oranı" value={`%${stats.acceptanceRate}`} />
          <StatCard label="Sonucu kaydedilen" value={String(stats.outcomeCount)} />
          <StatCard label="İyileşme oranı" value={`%${stats.successRate}`} />
        </div>

        {/* Sekmeler */}
        <div className="flex gap-2">
          <TabButton active={tab === "decisions"} onClick={() => setTab("decisions")}>
            Karar hafızası ({records.length})
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
            Denetim günlüğü ({audit.length})
          </TabButton>
          <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
            Belgeler
          </TabButton>
        </div>

        {tab === "documents" && <DocumentsTab />}

        {tab === "decisions" && (
          <div className="space-y-3">
            {records.length === 0 && (
              <p className="text-sm text-abys-muted">
                Henüz karar kaydı yok. Karar Merkezi&apos;nde bir vakayı karara bağladığınızda burada görünür.
              </p>
            )}
            {records.map((r) => (
              <DecisionRow key={r.id} r={r} onChanged={refresh} />
            ))}
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-1.5">
            {audit.length === 0 && <p className="text-sm text-abys-muted">Henüz denetim kaydı yok.</p>}
            {audit.map((e) => (
              <div key={e.id} className="flex items-start gap-3 text-sm bg-abys-cream/60 rounded-lg px-4 py-2.5">
                <span className="text-xs text-abys-muted shrink-0 w-32 mt-0.5">
                  {new Date(e.createdAt).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="min-w-0">
                  <p className="text-abys-ink">
                    <span className="font-medium">{AUDIT_TYPE_META[e.type]}</span> · {e.summary}
                  </p>
                  {e.detail && <p className="text-xs text-abys-muted mt-0.5">{e.detail}</p>}
                  <p className="text-xs text-abys-muted mt-0.5">Aktör: {e.actor}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaisMemoryView() {
  const [cases, setCases] = useState<{ id: string; case: { title: string; confidence: number }; status: string }[] | null>(null);
  const [audit, setAudit] = useState<{ id: string; type: string; summary: string; created_at: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/decision-cases").then(async (r) => (r.ok ? (await r.json()).cases : [])),
      fetch("/api/audit?limit=20").then(async (r) => (r.ok ? (await r.json()).events : [])),
    ]).then(([caseRows, auditRows]) => {
      if (!cancelled) {
        setCases(caseRows);
        setAudit(auditRows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="TAIS KURUMSAL HAFIZA"
        title="Karar geçmişi ve"
        accent="denetim izi."
        desc="TAIS oturumu yalnızca sunucu tarafındaki TAIS karar ve denetim kayıtlarını gösterir."
      />
      <div className="px-10 pb-16 max-w-4xl space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="TAIS karar vakası" value={cases ? String(cases.length) : "…"} />
          <StatCard label="Son denetim olayı" value={audit ? String(audit.length) : "…"} />
        </div>
        <div>
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">TAIS KARARLARI</p>
          <div className="space-y-2">
            {cases?.map((row) => (
              <div key={row.id} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
                <p className="text-sm text-abys-ink">{row.case.title}</p>
                <p className="text-xs text-abys-muted mt-1">Durum: {row.status} · Güven %{row.case.confidence}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">TAIS DENETİM OLAYLARI</p>
          <div className="space-y-1.5">
            {audit?.map((event) => (
              <p key={event.id} className="text-sm text-abys-ink bg-abys-cream/60 rounded-lg px-4 py-2.5">
                <span className="text-xs text-abys-muted">{new Date(event.created_at).toLocaleString("tr-TR")}</span> · {event.summary}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5">
      <p className="font-serif text-2xl text-abys-navy">{value}</p>
      <p className="text-xs text-abys-muted mt-0.5">{label}</p>
    </div>
  );
}

interface DocRow {
  id: string;
  title: string;
  source_type: string;
  byte_size: number;
  uploaded_by: string;
  chunk_count: number;
  created_at: string;
}

const DOC_TYPES = ["policy", "procedure", "report", "incident", "txt", "md", "csv"];

/**
 * Kurumsal hafıza belge sekmesi (Faz 5): belge içe alma ve listeleme.
 * Yükleme ingest_data izni ister (yoksa sunucu 403 döner ve burada gösterilir).
 * Rol kısıtı verilirse belge yalnızca o rollere görünür/erişilebilir olur.
 */
function DocumentsTab() {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("policy");
  const [text, setText] = useState("");
  const [restrictRole, setRestrictRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [fileTitle, setFileTitle] = useState("");
  const [filePick, setFilePick] = useState<File | null>(null);
  const [fileRestrictRole, setFileRestrictRole] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileOkMsg, setFileOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setError("Belgeler kurumsal oturum gerektirir.");
          setDocs([]);
          return;
        }
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Belgeler yüklenemedi.");
          setDocs([]);
          return;
        }
        setError(null);
        setDocs(j.documents);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Belgeler yüklenemedi.");
          setDocs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFilePick(file);
    if (file && !fileTitle) setFileTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function uploadFile() {
    if (!filePick) return;
    setFileBusy(true);
    setFileError(null);
    setFileOkMsg(null);
    try {
      const formData = new FormData();
      formData.set("file", filePick);
      if (fileTitle.trim()) formData.set("title", fileTitle.trim());
      if (fileRestrictRole) formData.set("allowedRoles", JSON.stringify([fileRestrictRole]));
      const r = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const j = await r.json();
      if (!r.ok) {
        setFileError(j.error ?? "Dosya yüklenemedi.");
        return;
      }
      setFileOkMsg(`Belge eklendi — ${j.chunkCount} parçaya bölündü ve Ask ABYS'te aranabilir.`);
      setFileTitle("");
      setFilePick(null);
      setFileRestrictRole("");
      setReloadKey((k) => k + 1);
    } catch {
      setFileError("Dosya yüklenemedi.");
    } finally {
      setFileBusy(false);
    }
  }

  async function upload() {
    if (!title.trim() || !text.trim()) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sourceType,
          text,
          allowedRoles: restrictRole ? [restrictRole] : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Belge eklenemedi.");
        return;
      }
      setOkMsg(`Belge eklendi — ${j.chunkCount} parçaya bölündü ve Ask ABYS'te aranabilir.`);
      setTitle("");
      setText("");
      setRestrictRole("");
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-3">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">BELGE EKLE</p>
        <p className="text-xs text-abys-muted">
          Prosedür, politika, olay raporu veya toplantı kararı ekleyin. Belge parçalara bölünür ve
          Ask ABYS cevaplarında <strong>atıfla</strong> kullanılır. İçerik talimat olarak değil,
          yalnızca veri olarak işlenir.
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Belge başlığı"
            className="flex-1 min-w-[200px] text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={restrictRole}
            onChange={(e) => setRestrictRole(e.target.value)}
            title="Rol kısıtı — boş bırakılırsa tüm roller erişebilir"
            className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            <option value="">Tüm roller erişebilir</option>
            <option value="ceo">Yalnızca CEO</option>
            <option value="sys_admin">Yalnızca sistem yöneticisi</option>
            <option value="auditor">Yalnızca denetçi</option>
          </select>
        </div>

        <input type="file" accept=".txt,.md,.csv" onChange={onFile} className="text-sm block" />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Belge metnini yapıştırın ya da yukarıdan dosya seçin…"
          className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
        />

        {error && <p className="text-sm text-abys-critical">{error}</p>}
        {okMsg && <p className="text-sm text-abys-healthy">{okMsg}</p>}

        <button
          onClick={upload}
          disabled={busy || !title.trim() || !text.trim()}
          className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Ekleniyor…" : "Belgeyi kurumsal hafızaya ekle"}
        </button>
      </div>

      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-3">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">DOSYADAN BELGE EKLE (PDF / DOCX)</p>
        <p className="text-xs text-abys-muted">
          PDF veya Word (.docx) dosyasından metin otomatik çıkarılır. Diğer türler için
          yukarıdaki yapıştırma yolunu kullanın.
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            value={fileTitle}
            onChange={(e) => setFileTitle(e.target.value)}
            placeholder="Belge başlığı (boşsa dosya adı kullanılır)"
            className="flex-1 min-w-[200px] text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
          <select
            value={fileRestrictRole}
            onChange={(e) => setFileRestrictRole(e.target.value)}
            title="Rol kısıtı — boş bırakılırsa tüm roller erişebilir"
            className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            <option value="">Tüm roller erişebilir</option>
            <option value="ceo">Yalnızca CEO</option>
            <option value="sys_admin">Yalnızca sistem yöneticisi</option>
            <option value="auditor">Yalnızca denetçi</option>
          </select>
        </div>

        <input type="file" accept=".pdf,.docx,.txt,.csv" onChange={onFilePick} className="text-sm block" />

        {fileError && <p className="text-sm text-abys-critical">{fileError}</p>}
        {fileOkMsg && <p className="text-sm text-abys-healthy">{fileOkMsg}</p>}

        <button
          onClick={uploadFile}
          disabled={fileBusy || !filePick}
          className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {fileBusy ? "Yükleniyor…" : "Dosyayı kurumsal hafızaya ekle"}
        </button>
      </div>

      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
          KURUMSAL BELGELER {docs ? `(${docs.length})` : ""}
        </p>
        {docs === null && <p className="text-sm text-abys-muted">Yükleniyor…</p>}
        {docs?.length === 0 && (
          <p className="text-sm text-abys-muted">Henüz belge yok. Yukarıdan ekleyin.</p>
        )}
        <div className="space-y-2">
          {docs?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg bg-abys-cream/60 px-4 py-2.5">
              <span className="text-[10px] font-mono rounded px-1.5 py-0.5 bg-abys-ink/5 text-abys-muted shrink-0">
                {d.source_type}
              </span>
              <span className="text-sm text-abys-ink flex-1">{d.title}</span>
              <span className="text-xs text-abys-muted shrink-0">
                {d.chunk_count} parça · {Math.max(1, Math.round(d.byte_size / 1024))} KB · {d.uploaded_by}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm rounded-full px-4 py-2 border transition-colors ${
        active ? "bg-abys-navy text-white border-abys-navy" : "border-abys-ink/15 text-abys-ink hover:bg-abys-cream"
      }`}
    >
      {children}
    </button>
  );
}

function DecisionRow({ r, onChanged }: { r: DecisionRecord; onChanged: () => void }) {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<OutcomeResult>("improved");
  const [note, setNote] = useState("");
  const meta = SEVERITY_META[r.severity];
  const choiceMeta = CHOICE_META[r.choice];

  function saveOutcome() {
    saveDecision({
      ...r,
      outcome: { recordedAt: new Date().toISOString(), result, note: note.trim() },
    });
    logAudit(
      "outcome_recorded",
      r.decidedBy,
      `Sonuç kaydedildi: ${r.caseTitle}`,
      `${outcomeLabel(result)}${note.trim() ? ` — ${note.trim()}` : ""}`
    );
    setRecording(false);
    setNote("");
    onChanged();
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream px-5 py-4">
      <div className="flex items-start gap-3">
        <span
          className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 mt-0.5 shrink-0"
          style={{ color: meta.color, background: meta.soft }}
        >
          {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-abys-ink">{r.caseTitle}</p>
          <p className="text-xs text-abys-muted mt-1">
            {r.categoryLabel} · {new Date(r.createdAt).toLocaleDateString("tr-TR")} · {r.decidedBy} · Güven %{r.confidence}
          </p>

          <div className="mt-3 space-y-1.5 text-sm">
            <p>
              <span className="text-xs font-semibold text-abys-muted">ABYS önerisi: </span>
              <span className="text-abys-ink">{r.recommendedAction || "—"}</span>
            </p>
            <p>
              <span className="text-xs font-semibold" style={{ color: choiceMeta.color }}>
                {choiceMeta.label}
              </span>
              {r.choice !== "accepted" && r.chosenAction && (
                <span className="text-abys-ink"> · Uygulanan: {r.chosenAction}</span>
              )}
            </p>
            {r.reason && (
              <p className="text-xs text-abys-muted">Gerekçe: {r.reason}</p>
            )}
          </div>

          {/* Sonuç */}
          <div className="mt-3 pt-3 border-t border-abys-ink/10">
            {r.outcome ? (
              <p className="text-sm">
                <span className="text-xs font-semibold text-abys-muted">SONUÇ: </span>
                <span
                  className="font-medium"
                  style={{
                    color:
                      r.outcome.result === "improved"
                        ? "var(--abys-healthy)"
                        : r.outcome.result === "worsened"
                          ? "var(--abys-critical)"
                          : "var(--abys-warning)",
                  }}
                >
                  {outcomeLabel(r.outcome.result)}
                </span>
                {r.outcome.note && <span className="text-abys-ink"> — {r.outcome.note}</span>}
              </p>
            ) : recording ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {(["improved", "unchanged", "worsened"] as OutcomeResult[]).map((res) => (
                    <button
                      key={res}
                      onClick={() => setResult(res)}
                      className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                        result === res
                          ? "bg-abys-navy text-white border-abys-navy"
                          : "border-abys-ink/15 text-abys-ink hover:bg-white/60"
                      }`}
                    >
                      {outcomeLabel(res)}
                    </button>
                  ))}
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ne oldu? (örn: rötar 12 dk ile sınırlı kaldı)"
                  className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
                />
                <div className="flex gap-2">
                  <button onClick={saveOutcome} className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5">
                    Kaydet
                  </button>
                  <button
                    onClick={() => setRecording(false)}
                    className="text-xs rounded-lg border border-abys-ink/15 text-abys-ink px-3 py-1.5"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-ink hover:bg-white/60"
              >
                + Sonucu kaydet — ABYS bundan öğrenir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
