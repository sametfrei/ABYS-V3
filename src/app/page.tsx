import { redirect } from "next/navigation";
import { redirectIfAuthenticated } from "@/lib/auth/guard";

/**
 * Uygulama açılışı. Geçerli sunucu oturumu varsa doğrudan dashboard'a,
 * yoksa login ekranına gider. Pazarlama sayfası yerine gerçek ürün girişi
 * gösterilir; böylece oturumsuz kullanıcı boş/yanlış ekranla karşılaşmaz.
 */
export default async function Home() {
  await redirectIfAuthenticated();
  redirect("/login");
}
