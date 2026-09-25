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
      ownerId: v.optional(v.string()),
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
      ownerId: v.optional(v.string()),
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
      channel: v.optional(v.union(v.literal("in_app"), v.literal("whatsapp"))),
      providerMessageId: v.optional(v.string()),
      read: v.optional(v.boolean()),
      createdAt: v.number(),
    }).index("byUser", ["userId"]),

    vendorPhotos: defineTable({
      vendorId: v.id("vendors"),
      storageId: v.string(),
      caption: v.optional(v.string()),
      active: v.optional(v.boolean()),
      createdAt: v.number(),
    })
      .index("byVendor", ["vendorId"])
      .index("byVendorActive", ["vendorId", "active"]),

    serviceRequests: defineTable({
      requesterId: v.id("users"),
      title: v.string(),
      description: v.string(),
      category: categoryValidator,
      landmark: v.string(),
      budget: v.optional(v.string()),
      neededAt: v.optional(v.number()),
      status: requestStatusValidator,
      vendorId: v.optional(v.id("vendors")),
      claimedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byStatus", ["status"])
      .index("byLandmark", ["landmark"])
      .index("byRequester", ["requesterId"])
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
    }).index("byUser", ["userId"]),

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
