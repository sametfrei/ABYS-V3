"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

/**
 * Kurum kullanıcı yönetimi (yalnızca sys_admin).
 *
 * Güvenlik notu: Bu bölümü yalnızca sys_admin oturumunda göstermek bir
 * güvenlik önlemi DEĞİLDİR; yetki her istekte sunucuda (`manage_users`)
 * uygulanır. Aşağıdaki rol listesi yalnızca seçenek etiketleridir.
 */
const ROLE_OPTIONS = [
  "board",
  "ceo",
  "clevel",
  "dept_manager",
  "risk_manager",
  "analyst",
  "auditor",
  "data_admin",
  "sys_admin",
] as const;

const MIN_PASSWORD_LENGTH = 12;

type UserStatus = "active" | "disabled";

interface ManageUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: UserStatus;
  createdAt: string;
}

function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}

function formatMessage(
  locale: Locale,
  key: ShellKey,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    t(locale, key)
  );
}

function roleLabel(locale: Locale, role: string): string {
  const key = `settings.users.role.${role}` as ShellKey;
  const label = t(locale, key);
  return label === key ? role : label;
}

function toUser(value: unknown): ManageUser | null {
  if (!value || typeof value !== "object") return null;
  const u = value as Record<string, unknown>;
  if (
    typeof u.id !== "string" ||
    typeof u.email !== "string" ||
    typeof u.displayName !== "string" ||
    typeof u.role !== "string"
  ) {
    return null;
  }
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: u.status === "disabled" ? "disabled" : "active",
    createdAt: typeof u.createdAt === "string" ? u.createdAt : "",
  };
}

function sortUsers(users: ManageUser[]): ManageUser[] {
  return [...users].sort((a, b) => a.email.localeCompare(b.email));
}

/** Sunucunun Türkçe hata metnini kullanır; yoksa durum kodlu yedek metin. */
async function readError(res: Response, locale: Locale): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // Gövde JSON değilse yedek metne düş.
  }
  return formatMessage(locale, "settings.users.failedHttp", { status: res.status });
}

const inputClass =
  "w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3 text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent";
const labelClass =
  "block text-xs tracking-widest text-abys-muted font-semibold mb-2";

export function UserManagement() {
  const locale = useLocale();
  const [users, setUsers] = useState<ManageUser[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState({
    email: "",
    displayName: "",
    role: "analyst",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) throw new Error(await readError(res, locale));
        const data = (await res.json()) as { users?: unknown };
        const list = Array.isArray(data?.users)
          ? data.users
              .map(toUser)
              .filter((u): u is ManageUser => u !== null)
          : [];
        if (cancelled) return;
        setUsers(sortUsers(list));
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t(locale, "settings.users.network"));
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey, locale]);

  function replaceUser(updated: ManageUser) {
    setUsers((prev) =>
      sortUsers(prev.map((u) => (u.id === updated.id ? updated : u)))
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormNotice("");

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setFormError(formatMessage(locale, "settings.users.passwordMin", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          displayName: form.displayName,
          role: form.role,
          password: form.password,
        }),
      });
      if (!res.ok) {
        setFormError(await readError(res, locale));
        return;
      }
      const data = (await res.json()) as { user?: unknown };
      const created = toUser(data?.user);
      if (created) {
        setUsers((prev) => sortUsers([...prev, created]));
      }
      setForm({ email: "", displayName: "", role: "analyst", password: "" });
      setFormNotice(t(locale, "settings.users.created"));
    } catch {
      setFormError(t(locale, "settings.users.network"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section
      className="px-4 sm:px-6 lg:px-10 pb-16 max-w-3xl"
      aria-labelledby="user-management-heading"
    >
      <h2
        id="user-management-heading"
        className="font-serif text-2xl text-abys-navy mb-1"
      >
        {t(locale, "settings.users.title")}
      </h2>
      <p className="text-sm text-abys-muted mb-6">
        {t(locale, "settings.users.subtitle")}
      </p>

      {loadState === "loading" && (
        <p className="text-sm text-abys-muted" role="status" aria-live="polite">
          {t(locale, "settings.users.loading")}
        </p>
      )}

      {loadState === "error" && (
        <div className="rounded-xl border border-abys-critical bg-abys-critical-soft p-4 text-sm text-abys-critical" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadState("loading");
              setLoadError("");
              setReloadKey((k) => k + 1);
            }}
            className="mt-3 rounded-full border border-abys-critical/40 px-4 py-1.5 text-xs hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-abys-critical"
          >
            {t(locale, "settings.users.retry")}
          </button>
        </div>
      )}

      {loadState === "ready" && users.length === 0 && (
        <p className="rounded-xl border border-abys-cream-border bg-abys-cream p-4 text-sm text-abys-muted">
          {t(locale, "settings.users.empty")}
        </p>
      )}

      {loadState === "ready" && users.length > 0 && (
        <ul className="space-y-3 list-none p-0 m-0">
          {users.map((user) => (
            <UserRow
              key={`${user.id}:${user.role}:${user.status}`}
              user={user}
              onUpdated={replaceUser}
            />
          ))}
        </ul>
      )}

      <div className="mt-8 rounded-xl border border-abys-cream-border bg-abys-cream p-5">
        <h3 className="font-serif text-lg text-abys-navy mb-1">
          {t(locale, "settings.users.newTitle")}
        </h3>
        <p className="text-xs text-abys-muted mb-4">
          {formatMessage(locale, "settings.users.tempPasswordHelp", {
            min: MIN_PASSWORD_LENGTH,
          })}
        </p>

        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div>
            <label htmlFor="new-user-email" className={labelClass}>
              {t(locale, "settings.users.email")}
            </label>
            <input
              id="new-user-email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="new-user-name" className={labelClass}>
              {t(locale, "settings.users.displayName")}
            </label>
            <input
              id="new-user-name"
              type="text"
              required
              autoComplete="name"
              maxLength={100}
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="new-user-role" className={labelClass}>
              {t(locale, "settings.users.role")}
            </label>
            <select
              id="new-user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(locale, role)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="new-user-password" className={labelClass}>
              {t(locale, "settings.users.tempPassword")}
            </label>
            <input
              id="new-user-password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={200}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
            />
          </div>

          {formError && (
            <p className="text-sm text-abys-critical" role="alert">
              {formError}
            </p>
          )}
          {formNotice && (
            <p className="text-sm text-abys-healthy" role="status">
              {formNotice}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-abys-accent text-white text-sm px-5 py-2.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-50"
          >
            {creating ? t(locale, "settings.users.creating") : t(locale, "settings.users.create")}
          </button>
        </form>
      </div>
    </section>
  );
}

function UserRow({
  user,
  onUpdated,
}: {
  user: ManageUser;
  onUpdated: (user: ManageUser) => void;
}) {
  const locale = useLocale();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  const dirty = role !== user.role || status !== user.status;
  const roleId = `user-role-${user.id}`;
  const passwordId = `user-password-${user.id}`;
  const passwordErrorId = `user-password-error-${user.id}`;
  const passwordPanelId = `user-password-panel-${user.id}`;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");

    const payload: { role?: string; status?: UserStatus } = {};
    if (role !== user.role) payload.role = role;
    if (status !== user.status) payload.status = status;

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await readError(res, locale));
        return;
      }
      const data = (await res.json()) as { user?: unknown };
      const updated = toUser(data?.user);
      if (updated) onUpdated(updated);
    } catch {
      setError(t(locale, "settings.users.network"));
    } finally {
      setSaving(false);
    }
  }

  function openPasswordReset() {
    setPassword(""); // Önceki denemeden kalan değer bellekte tutulmaz.
    setPasswordError("");
    setPasswordNotice("");
    setPasswordOpen(true);
  }

  function cancelPasswordReset() {
    setPassword("");
    setPasswordError("");
    setPasswordOpen(false);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordError("");
    setPasswordNotice("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(
        formatMessage(locale, "settings.users.passwordMin", { min: MIN_PASSWORD_LENGTH })
      );
      return;
    }
    if (password.length > 200) {
      setPasswordError(formatMessage(locale, "settings.users.passwordMax", { max: 200 }));
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setPasswordError(await readError(res, locale));
        return;
      }
      // Parola yanıtta dönmez; yalnızca başarı durumu işlenir.
      setPassword("");
      setPasswordError("");
      setPasswordOpen(false);
      setPasswordNotice(t(locale, "settings.users.passwordReset"));
    } catch {
      setPasswordError(t(locale, "settings.users.network"));
    } finally {
      setPasswordSaving(false);
    }
  }

  const isActive = status === "active";

  return (
    <li className="rounded-xl border border-abys-cream-border bg-abys-cream p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-medium text-abys-ink">{user.displayName}</p>
          <p className="text-xs text-abys-muted break-all">{user.email}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            user.status === "active"
              ? "bg-abys-healthy-soft text-abys-healthy"
              : "bg-abys-critical-soft text-abys-critical"
          }`}
        >
          {user.status === "active"
            ? t(locale, "settings.users.statusActive")
            : t(locale, "settings.users.statusDisabled")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor={roleId} className={labelClass}>
            {t(locale, "settings.users.role")}
          </label>
          <select
            id={roleId}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2.5 text-sm text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {roleLabel(locale, option)}
              </option>
            ))}
            {!ROLE_OPTIONS.some((option) => option === role) && (
              <option value={role}>{roleLabel(locale, role)}</option>
            )}
          </select>
        </div>

        <div>
          <span className={labelClass}>{t(locale, "settings.users.status")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label={formatMessage(locale, "settings.users.statusAria", {
              name: user.displayName,
              status: isActive
                ? t(locale, "settings.users.statusActive")
                : t(locale, "settings.users.statusDisabled"),
            })}
            onClick={() => setStatus(isActive ? "disabled" : "active")}
            className={`w-full sm:w-auto rounded-full border px-4 py-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-abys-accent ${
              isActive
                ? "border-abys-healthy/40 bg-abys-healthy-soft text-abys-healthy"
                : "border-abys-critical/40 bg-abys-critical-soft text-abys-critical"
            }`}
          >
            {isActive
              ? t(locale, "settings.users.statusActive")
              : t(locale, "settings.users.statusDisabled")}
          </button>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          aria-label={formatMessage(locale, "settings.users.saveAria", {
            name: user.displayName,
          })}
          className="rounded-full bg-abys-accent text-white text-xs px-4 py-2.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-40"
        >
          {saving ? t(locale, "settings.users.saving") : t(locale, "settings.users.save")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={passwordOpen ? cancelPasswordReset : openPasswordReset}
          aria-expanded={passwordOpen}
          aria-controls={passwordPanelId}
          aria-label={formatMessage(locale, "settings.users.resetPasswordAria", {
            name: user.displayName,
          })}
          className="rounded-full border border-abys-cream-border bg-white/60 px-3 py-1.5 text-xs font-semibold text-abys-ink hover:border-abys-accent/50 focus:outline-none focus:ring-2 focus:ring-abys-accent"
        >
          {t(locale, "settings.users.resetPassword")}
        </button>
        {passwordNotice && (
          <p className="text-xs text-abys-healthy" role="status">
            {passwordNotice}
          </p>
        )}
      </div>

      {passwordOpen && (
        <form
          id={passwordPanelId}
          onSubmit={resetPassword}
          className="mt-3 rounded-lg border border-abys-cream-border bg-white/40 p-3"
          noValidate
        >
          <label htmlFor={passwordId} className={labelClass}>
            {t(locale, "settings.users.newPassword")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={passwordId}
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={200}
              autoComplete="new-password"
              autoFocus
              disabled={passwordSaving}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={
                passwordError ? passwordErrorId : undefined
              }
              className="w-full sm:flex-1 rounded-lg border border-abys-cream-border bg-abys-cream px-3 py-2.5 text-sm text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-full bg-abys-accent text-white text-xs px-4 py-2.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-40"
            >
              {passwordSaving ? t(locale, "settings.users.saving") : t(locale, "settings.users.save")}
            </button>
            <button
              type="button"
              onClick={cancelPasswordReset}
              disabled={passwordSaving}
              className="rounded-full border border-abys-cream-border px-4 py-2.5 text-xs font-semibold text-abys-ink hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-40"
            >
              {t(locale, "settings.users.cancel")}
            </button>
          </div>
          <p className="mt-2 text-xs text-abys-muted">
            {formatMessage(locale, "settings.users.passwordHelp", {
              min: MIN_PASSWORD_LENGTH,
            })}
          </p>
          {passwordError && (
            <p
              id={passwordErrorId}
              className="mt-2 text-xs text-abys-critical"
              role="alert"
            >
              {passwordError}
            </p>
          )}
        </form>
      )}

      {error && (
        <p className="mt-3 text-xs text-abys-critical" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
