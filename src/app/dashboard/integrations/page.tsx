import { redirect } from "next/navigation";

/**
 * The old localStorage-based integration prototype is retired.
 * Authenticated workspaces use the tenant-scoped connector registry.
 */
export default function IntegrationsPage() {
  redirect("/dashboard/connectors");
}
