import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  STAFF: "staff",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.STAFF),
);
export type Role = Infer<typeof roleValidator>;

export const vendorStatusValidator = v.union(v.literal("draft"), v.literal("active"), v.literal("archived"));
export const categoryValidator = v.union(
  v.literal("Servis Teknik"),
  v.literal("Hajatan & Acara"),
  v.literal("Kuliner"),
  v.literal("Transportasi"),
  v.literal("Jasa Umum"),
);
export const requestStatusValidator = v.union(
  v.literal("open"),
  v.literal("claimed"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("expired"),
);
export const availabilityStatusValidator = v.union(
  v.literal("available"),
  v.literal("busy"),
  v.literal("closed"),
);
export const interactionKindValidator = v.union(
  v.literal("whatsapp"),
  v.literal("share"),
  v.literal("call"),
  v.literal("view"),
  v.literal("request"),
);
export const interactionStatusValidator = v.union(
  v.literal("opened"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("dismissed"),
);

const schema = defineSchema(
  {
    ...authTables,
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    businesses: defineTable({
      name: v.string(),
      ownerId: v.optional(v.id("users")),
      description: v.optional(v.string()),
      createdAt: v.number(),
    }).index("byOwner", ["ownerId"]),

    vendors: defineTable({
      slug: v.string(),
      name: v.string(),
      category: categoryValidator,
      description: v.string(),
      address: v.string(),
      landmark: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      price: v.string(),
      hours: v.string(),
      phone: v.string(),
      rating: v.string(),
      reviewsCount: v.optional(v.number()),
      accent: v.string(),
      mark: v.string(),
      tags: v.array(v.string()),
      status: vendorStatusValidator,
      featured: v.optional(v.boolean()),
      verified: v.optional(v.boolean()),
      photoId: v.optional(v.string()),
      ownerId: v.optional(v.id("users")),
      businessId: v.optional(v.string()),
      subscriptionTier: v.optional(v.union(v.literal("free"), v.literal("featured"), v.literal("premium"))),
      whatsappClicks: v.optional(v.number()),
      shareClicks: v.optional(v.number()),
      searchImpressions: v.optional(v.number()),
      availability: v.optional(availabilityStatusValidator),
      availabilityNote: v.optional(v.string()),
      nextAvailableAt: v.optional(v.number()),
      responseMinutes: v.optional(v.number()),
      serviceRadiusKm: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("bySlug", ["slug"])
      .index("byStatus", ["status"])
      .index("byLandmark", ["landmark"])
      .index("byOwner", ["ownerId"]),

    reviews: defineTable({
      vendorId: v.id("vendors"),
      authorId: v.optional(v.id("users")),
      authorName: v.string(),
      rating: v.number(),
      body: v.string(),
      helpful: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byCreatedAt", ["createdAt"]),

    favorites: defineTable({
      userId: v.id("users"),
      vendorId: v.id("vendors"),
      collection: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("byUser", ["userId"])
      .index("byUserVendor", ["userId", "vendorId"]),

    notifications: defineTable({
      userId: v.optional(v.id("users")),
      email: v.optional(v.string()),
      kind: v.string(),
      title: v.string(),
      body: v.string(),
      // Disimpan supaya notifikasi moderasi bisa langsung membawa pengelola ke
      // listing yang perlu ditinjau, bukan cuma teks bebas.
      vendorId: v.optional(v.id("vendors")),
      channel: v.optional(v.union(v.literal("in_app"), v.literal("whatsapp"))),
      providerMessageId: v.optional(v.string()),
      read: v.optional(v.boolean()),
      createdAt: v.number(),
    })
      .index("byUser", ["userId"])
      .index("byVendor", ["vendorId"]),

    vendorPhotos: defineTable({
      vendorId: v.id("vendors"),
      storageId: v.string(),
      caption: v.optional(v.string()),
      active: v.optional(v.boolean()),
      moderationStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
      moderationNote: v.optional(v.string()),
      moderatedBy: v.optional(v.id("users")),
      moderatedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byVendorActive", ["vendorId", "active"])
      .index("byModeration", ["moderationStatus"]),

    serviceRequests: defineTable({
      requesterId: v.id("users"),
      title: v.string(),
      description: v.string(),
      category: categoryValidator,
      landmark: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      budget: v.optional(v.string()),
      neededAt: v.optional(v.number()),
      status: requestStatusValidator,
      vendorId: v.optional(v.id("vendors")),
      claimedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),
      cancelledReason: v.optional(v.string()),
      reopenedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byStatus", ["status"])
      .index("byLandmark", ["landmark"])
      .index("byRequester", ["requesterId"])
      .index("byVendor", ["vendorId"])
      .index("byExpiresAt", ["expiresAt"])
      .index("byCreatedAt", ["createdAt"]),

    vendorPackages: defineTable({
      vendorId: v.id("vendors"),
      name: v.string(),
      description: v.string(),
      price: v.string(),
      duration: v.optional(v.string()),
      area: v.optional(v.string()),
      active: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byVendorActive", ["vendorId", "active"]),

    vendorInteractions: defineTable({
      userId: v.id("users"),
      vendorId: v.id("vendors"),
      requestId: v.optional(v.id("serviceRequests")),
      kind: interactionKindValidator,
      status: interactionStatusValidator,
      note: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byUser", ["userId"])
      .index("byVendor", ["vendorId"]),

    reports: defineTable({
      reporterId: v.optional(v.id("users")),
      vendorId: v.optional(v.id("vendors")),
      requestId: v.optional(v.id("serviceRequests")),
      reason: v.string(),
      details: v.string(),
      status: v.union(v.literal("open"), v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byStatus", ["status"])
      .index("byVendor", ["vendorId"]),

    notificationPreferences: defineTable({
      userId: v.id("users"),
      whatsappUpdates: v.optional(v.boolean()),
      whatsappPhone: v.optional(v.string()),
      whatsappOptInAt: v.optional(v.number()),
      areaUpdates: v.optional(v.boolean()),
      requestUpdates: v.optional(v.boolean()),
      updatedAt: v.number(),
    }).index("byUser", ["userId"]),

    staffMembers: defineTable({
      userId: v.id("users"),
      role: v.union(v.literal("admin"), v.literal("staff"), v.literal("viewer")),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index("byUser", ["userId"])
      .index("byRole", ["role"]),

    auditLogs: defineTable({
      action: v.string(),
      actorId: v.optional(v.id("users")),
      vendorId: v.optional(v.id("vendors")),
      requestId: v.optional(v.id("serviceRequests")),
      entityId: v.optional(v.string()),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("byActor", ["actorId"])
      .index("byVendor", ["vendorId"])
      .index("byAction", ["action"])
      .index("byCreatedAt", ["createdAt"]),

    staffInvites: defineTable({
      email: v.string(),
      role: v.union(v.literal("admin"), v.literal("staff"), v.literal("viewer")),
      tokenHash: v.string(),
      invitedBy: v.id("users"),
      expiresAt: v.number(),
      acceptedAt: v.optional(v.number()),
      acceptedBy: v.optional(v.id("users")),
      revokedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byEmail", ["email"])
      .index("byTokenHash", ["tokenHash"])
      .index("byExpiresAt", ["expiresAt"]),

    listingClaims: defineTable({
      vendorId: v.id("vendors"),
      requesterId: v.id("users"),
      whatsappPhone: v.string(),
      email: v.string(),
      businessAddress: v.string(),
      evidenceStorageId: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected")),
      reviewNote: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byStatus", ["status"])
      .index("byRequester", ["requesterId"]),

    listingHistory: defineTable({
      vendorId: v.id("vendors"),
      actorId: v.optional(v.id("users")),
      changes: v.array(v.object({
        field: v.string(),
        oldValue: v.optional(v.string()),
        newValue: v.optional(v.string()),
      })),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byCreatedAt", ["createdAt"]),

    requestOffers: defineTable({
      requestId: v.id("serviceRequests"),
      vendorId: v.id("vendors"),
      offeredBy: v.id("users"),
      message: v.optional(v.string()),
      status: v.union(v.literal("offered"), v.literal("accepted"), v.literal("withdrawn"), v.literal("expired")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byRequest", ["requestId"])
      .index("byVendor", ["vendorId"])
      .index("byRequestVendor", ["requestId", "vendorId"]),

    analyticsEvents: defineTable({
      event: v.string(),
      userId: v.optional(v.id("users")),
      anonymousId: v.optional(v.string()),
      vendorId: v.optional(v.id("vendors")),
      requestId: v.optional(v.id("serviceRequests")),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("byEvent", ["event"])
      .index("byCreatedAt", ["createdAt"])
      .index("byVendor", ["vendorId"]),

    whatsappDeliveries: defineTable({
      deliveryKey: v.string(),
      userId: v.id("users"),
      providerMessageId: v.optional(v.string()),
      status: v.union(v.literal("queued"), v.literal("sent"), v.literal("delivered"), v.literal("failed")),
      attempts: v.number(),
      title: v.string(),
      body: v.string(),
      lastErrorCode: v.optional(v.string()),
      nextAttemptAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byDeliveryKey", ["deliveryKey"])
      .index("byProviderMessageId", ["providerMessageId"])
      .index("byStatus", ["status"])
      .index("byUser", ["userId"])
      .index("byNextAttempt", ["nextAttemptAt"]),

    // Percobaan masuk ke ruang /admin lewat passcode. `key` adalah hash dari
    // deviceId + IP terlapor + email, jadi indeks tidak menyimpan identitas
    // mentah sekaligus rate limit tidak bisa ditelusuri balik ke orangnya.
    adminPasscodeAttempts: defineTable({
      key: v.string(),
      outcome: v.union(v.literal("success"), v.literal("failed"), v.literal("locked")),
      emailMasked: v.optional(v.string()),
      reportedIp: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      timezone: v.optional(v.string()),
      locale: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("byKey", ["key"])
      .index("byCreatedAt", ["createdAt"])
      .index("byOutcome", ["outcome"]),

    // Tiket sekali pakai yang diterbitkan setelah passcode admin valid.
    // Hanya hash tiket yang disimpan, bukan token aslinya.
    adminPasscodeTickets: defineTable({
      email: v.string(),
      tokenHash: v.string(),
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byTokenHash", ["tokenHash"]),

    vendorSubscriptions: defineTable({
      vendorId: v.id("vendors"),
      tier: v.union(v.literal("free"), v.literal("featured"), v.literal("premium")),
      status: v.union(v.literal("active"), v.literal("cancelled"), v.literal("past_due")),
      startedAt: v.number(),
      renewsAt: v.optional(v.number()),
    }).index("byVendor", ["vendorId"]),
  },
  { schemaValidation: false },
);

export default schema;
