import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import { sessionRefOf } from "../lib/audit-detail";
import type { DataModel } from "./_generated/dataModel";

export type AuditAction =
  | "review.created"
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
  | "staff.role_change_blocked"
  | "staff.invite_accepted"
  | "admin.invite_created"
  | "staff.invite_rejected"
  | "admin.logout"
  | "admin.profile_updated"
  | "admin.passcode_changed"
  | "admin.session_revoked"
  | "admin.security_viewed"
  | "admin.security_detail_viewed";

/**
 * Potret pelaku untuk satu baris audit.
 *
 * Di sini, bukan di tiap call site. Ada tiga puluh-anam titik yang menulis
 * audit; menyuruh tiap titik mengisi nama, email, peran, dan nomor sesi
 * berarti tiga puluh-anam tempat yang bisa lupa satu kolom — dan baris yang
 * lupa kolom seperti itu tidak akan pernah terlihat, karena kelihatannya
 * tetap punya isi.
 *
 * Yang TIDAK disimpan: id sesi mentah, token, passcode, atau alamat IP.
 * Nomor sesi disimpan sebagai turunan satu arah (lihat `sessionRefOf`).
 */
export async function resolveAuditActor(
  ctx: GenericMutationCtx<DataModel>,
  actorId?: DataModel["users"]["document"]["_id"],
) {
  const resolvedId = actorId ?? (await getAuthUserId(ctx));
  const sessionRef = await sessionRefOf(await getAuthSessionId(ctx));
  if (!resolvedId) return { actorId: undefined, sessionRef: sessionRef ?? undefined };
  const user = await ctx.db.get(resolvedId);
  if (!user) {
    // Akun sudah dihapus sejak kejadian. Sesi dan id-nya masih bukti yang
    // berguna, jadi tetap dicatat — tanpa nama dan tanpa email.
    return { actorId: resolvedId, sessionRef: sessionRef ?? undefined };
  }
  const membership = await ctx.db
    .query("staffMembers")
    .withIndex("byUser", (q) => q.eq("userId", resolvedId))
    .unique();
  return {
    actorId: resolvedId,
    actorName: user.name?.slice(0, 120),
    actorEmail: user.email?.slice(0, 160),
    actorRole: membership?.role ?? (user.role === "admin" || user.role === "staff" ? user.role : undefined),
    sessionRef: sessionRef ?? undefined,
  };
}

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
  const actor = await resolveAuditActor(ctx, input.actorId);
  return await ctx.db.insert("auditLogs", {
    action: input.action,
    ...actor,
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
