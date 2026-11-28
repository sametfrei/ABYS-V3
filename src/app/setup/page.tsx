import { cookies } from "next/headers";
import SetupClient from "./setup-client";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n";

export default async function SetupPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  return <SetupClient locale={locale} />;
}
