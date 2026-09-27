import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export type AuditAction =
  | "listing.created"
  | "listing.claim_submitted"
  | "listing.claim_approved"
  | "listing.claim_rejected"
  | "listing.archived"
  | "listing.published"
  | "listing.status_changed"
  | "listing.updated"
  | "request.status_changed"
  | "listing.verified"
  | "photo.uploaded"
  | "photo.moderated"
  | "report.moderated"
  | "staff.invited"
  | "staff.role_changed"
  | "staff.invite_accepted"
  | "user.phone_verified";

export async function writeAudit(
  ctx: GenericMutationCtx<DataModel>,
  input: {
    action: AuditAction;
    actorId?: DataModel["users"]["document"]["_id"];
    vendorId?: DataModel["vendors"]["document"]["_id"];
    requestId?: DataModel["serviceRequests"]["document"]["_id"];
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, string | number | boolean | undefined>;
  },
) {
  // Do not store provider secrets, access tokens, or raw request payloads.
  // Callers pass bounded, human-readable summaries only.
  return await ctx.db.insert("auditLogs", {
    action: input.action,
    actorId: input.actorId,
    vendorId: input.vendorId,
    requestId: input.requestId,
    entityId: input.entityId,
    oldValue: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue).slice(0, 2000),
    newValue: input.newValue === undefined ? undefined : JSON.stringify(input.newValue).slice(0, 2000),
    metadata: input.metadata,
    createdAt: Date.now(),
  });
}

export async function writeListingHistory(
  ctx: GenericMutationCtx<DataModel>,
  input: {
    vendorId: DataModel["vendors"]["document"]["_id"];
    actorId: DataModel["users"]["document"]["_id"];
    changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>;
    reason?: string;
  },
) {
  if (input.changes.length === 0) return;
  return await ctx.db.insert("listingHistory", {
    vendorId: input.vendorId,
    actorId: input.actorId,
    changes: input.changes.slice(0, 40).map((change) => ({
      field: change.field.slice(0, 80),
      oldValue: change.oldValue === undefined ? undefined : String(change.oldValue).slice(0, 500),
      newValue: change.newValue === undefined ? undefined : String(change.newValue).slice(0, 500),
    })),
    reason: input.reason?.trim().slice(0, 300) || undefined,
    createdAt: Date.now(),
  });
}
