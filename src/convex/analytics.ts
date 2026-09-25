import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { requireStaff } from "./access";

const eventNameValidator = v.union(
  v.literal("search_impression"),
  v.literal("listing_opened"),
  v.literal("whatsapp_clicked"),
  v.literal("share_clicked"),
  v.literal("call_clicked"),
  v.literal("request_created"),
  v.literal("request_claimed"),
  v.literal("request_completed"),
  v.literal("listing_published"),
  v.literal("listing_archived"),
  v.literal("photo_uploaded"),
  v.literal("notification_opted_in"),
  v.literal("request_matched"),
  v.literal("request_expired"),
);

export async function recordEvent(
  ctx: GenericMutationCtx<DataModel>,
  input: {
    event: string;
    userId?: DataModel["users"]["document"]["_id"];
    anonymousId?: string;
    vendorId?: DataModel["vendors"]["document"]["_id"];
    requestId?: DataModel["serviceRequests"]["document"]["_id"];
    metadata?: Record<string, string | number | boolean | undefined>;
  },
) {
  return await ctx.db.insert("analyticsEvents", {
    event: input.event.slice(0, 80),
    userId: input.userId,
    anonymousId: input.anonymousId?.slice(0, 120),
    vendorId: input.vendorId,
    requestId: input.requestId,
    metadata: input.metadata,
    createdAt: Date.now(),
  });
}

export const track = mutation({
  args: {
    event: eventNameValidator,
    anonymousId: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    requestId: v.optional(v.id("serviceRequests")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // Bound anonymous payloads to keep analytics useful without becoming a
    // general-purpose data store.
    const metadata = args.metadata && typeof args.metadata === "object"
      ? Object.fromEntries(Object.entries(args.metadata).slice(0, 12).map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 120) : typeof value === "number" || typeof value === "boolean" ? value : undefined]).filter(([, value]) => value !== undefined))
      : undefined;
    const id = await recordEvent(ctx, {
      event: args.event,
      userId: userId ?? undefined,
      anonymousId: args.anonymousId,
      vendorId: args.vendorId,
      requestId: args.requestId,
      metadata: metadata as Record<string, string | number | boolean> | undefined,
    });
    return id;
  },
});

export const adminMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const [events, vendors, requests, photos] = await Promise.all([
      ctx.db.query("analyticsEvents").collect(),
      ctx.db.query("vendors").collect(),
      ctx.db.query("serviceRequests").collect(),
      ctx.db.query("vendorPhotos").collect(),
    ]);
    const count = (event: string) => events.filter((row) => row.event === event).length;
    const active = vendors.filter((vendor) => vendor.status === "active");
    const photoIds = new Set(photos.filter((photo) => photo.active !== false && photo.moderationStatus !== "rejected").map((photo) => photo.vendorId));
    const byCategory = Object.fromEntries([...new Set(active.map((vendor) => vendor.category))].map((category) => [category, active.filter((vendor) => vendor.category === category).length]));
    const byArea = Object.fromEntries([...new Set(active.map((vendor) => vendor.landmark))].map((area) => [area, active.filter((vendor) => vendor.landmark === area).length]));
    const topProviders = vendors
      .filter((vendor) => vendor.ownerId)
      .map((vendor) => ({ id: vendor._id, name: vendor.name, responseMinutes: vendor.responseMinutes ?? 999999, requests: requests.filter((request) => request.vendorId === vendor._id).length }))
      .sort((a, b) => a.responseMinutes - b.responseMinutes || b.requests - a.requests)
      .slice(0, 8)
      .map(({ responseMinutes, ...provider }) => ({ ...provider, responseMinutes: responseMinutes === 999999 ? undefined : responseMinutes }));
    return {
      events: {
        searchImpression: count("search_impression"),
        listingOpened: count("listing_opened"),
        whatsappClicked: count("whatsapp_clicked"),
        shareClicked: count("share_clicked"),
        callClicked: count("call_clicked"),
        requestCreated: count("request_created"),
        requestClaimed: count("request_claimed"),
        requestCompleted: count("request_completed"),
        listingPublished: count("listing_published"),
        listingArchived: count("listing_archived"),
        photoUploaded: count("photo_uploaded"),
        notificationOptedIn: count("notification_opted_in"),
      },
      activeListings: active.length,
      listingsWithoutPrice: active.filter((vendor) => !vendor.price.trim()).length,
      listingsWithoutPhotos: active.filter((vendor) => !vendor.photoId && !photoIds.has(vendor._id)).length,
      listingsWithoutHours: active.filter((vendor) => !vendor.hours.trim()).length,
      byCategory,
      byArea,
      topProviders,
    };
  },
});
