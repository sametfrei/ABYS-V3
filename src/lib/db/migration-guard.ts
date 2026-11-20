import { getPendingMigrationApprovals, type PendingMigrationApproval } from "./client";

export function pendingMigration(id: number): PendingMigrationApproval | null {
  return getPendingMigrationApprovals().find((migration) => migration.id === id) ?? null;
}

export function migrationRequiredPayload(migration: PendingMigrationApproval) {
  return {
    error: `Bu özellik migration ${migration.id} onayı bekliyor.`,
    code: "MIGRATION_APPROVAL_REQUIRED",
    migration: {
      id: migration.id,
      name: migration.name,
      approvalEnv: migration.approvalEnv,
    },
  };
}
