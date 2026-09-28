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
      // Foto profil yang diunggah dari ruang kerja admin. Sengaja dipisah dari
      // `image`: kolom itu milik Convex Auth dan isinya bisa berupa URL dari
      // penyedia OAuth, bukan storage id milik kita. Menimpanya akan merusak
      // alur yang sudah ada.
      profileImageStorageId: v.optional(v.string()),
      profileUpdatedAt: v.optional(v.number()),
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
      .index("byModeration", ["moderationStatus"])
      .index("byModeratedBy", ["moderatedBy"]),

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
      .index("byReporter", ["reporterId"])
      .index("byRequest", ["requestId"])
      .index("byVendor", ["vendorId"]),

    notificationPreferences: defineTable({
      userId: v.id("users"),
      whatsappUpdates: v.optional(v.boolean()),
      whatsappPhone: v.optional(v.string()),
      whatsappOptInAt: v.optional(v.number()),
      areaUpdates: v.optional(v.boolean()),
      requestUpdates: v.optional(v.boolean()),
      updatedAt: v.number(),
    })
      .index("byUser", ["userId"])
      // Chat masuk dari webhook hanya membawa nomor, jadi nomor harus bisa
      // dicari tanpa scan seluruh tabel preferensi.
      .index("byPhone", ["whatsappPhone"]),

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
      // Potret pelaku pada saat kejadian, bukan hanya id-nya. Id user masih
      // ada, tapi id saja tidak bisa dibaca siapa pelakunya kalau akunnya
      // sudah dihapus atau emailnya berubah setelah kejadian.
      actorName: v.optional(v.string()),
      actorEmail: v.optional(v.string()),
      actorRole: v.optional(v.string()),
      // Nomor sesi ringkas dari id sesi Convex Auth, diturunkan satu arah.
      // Stored supaya "siapa melakukan perubahan" tetap punya jejak perangkat
      // yang bisa diperiksa ulang di Security Desk.
      sessionRef: v.optional(v.string()),
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
      .index("byRequestVendor", ["requestId", "vendorId"])
      .index("byOfferer", ["offeredBy"]),

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

    // Penghitung kumulatif per jenis peristiwa.
    //
    // `analyticsEvents` adalah log mentah yang tumbuh sendiri; dashboard admin
    // hanya butuh JUMLAHNYA per jenis. Menghitung dari log mentah berarti
    // membaca seluruh tabel setiap kali dashboard dibuka — makin lama makin
    // mahal, padahal jawabannya satu angka. Tabel ini menyimpan angka itu di
    // depan, jadi biayanya tetap 12 pembacaan kecil berapa pun besar lognya.
    //
    // Karena kumulatif, angka di sini tidak ikut turun saat log mentahnya
    // dipangkas retensi. Itu disengaja: yang dimaksud dashboard memang total
    // sepanjang masa, bukan jendela waktu.
    analyticsCounters: defineTable({
      key: v.string(),
      count: v.number(),
      updatedAt: v.number(),
    }).index("byKey", ["key"]),

    whatsappDeliveries: defineTable({
      deliveryKey: v.string(),
      // Kosong untuk kiriman sistem (alert bug ke admin). Alert admin bukan
      // notifikasi warga, jadi tidak boleh ikut menghitung atau menghabiskan
      // kuota tiga pesan per hari milik siapa pun.
      userId: v.optional(v.id("users")),
      // `resident` = notifikasi warga, `system` = alert operasional ke admin.
      audience: v.optional(v.union(v.literal("resident"), v.literal("system"))),
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
      .index("byNextAttempt", ["nextAttemptAt"])
      .index("byCreatedAt", ["createdAt"]),

    // Hitungan baris `whatsappDeliveries` menurut statusnya.
    //
    // Dashboard WhatsApp adalah query REAKTIF: setiap kali satu status
    // berubah, ia dijalankan ulang. Sebelumnya query itu membaca SELURUH tabel
    // untuk sekadar menghitung empat angka — jadi biaya satu kali kirim pesan
    // tumbuh seiring riwayat pengiriman, bukan tetap. Dengan satu dokumen
    // ringkasan ini, biayanya satu pembacaan kecil berapa pun panjangnya
    // riwayat.
    //
    // Isinya BUKAN total sepanjang masa, melainkan jumlah baris yang SAAT INI
    // berstatus demikian — sama persis dengan yang akan didapat dari menagregasi
    // tabelnya. Karena itu nilainya ikut turun ketika retensi menghapus baris
    // lama, dan `backfillWhatsappStats` bisa menghitung ulang persis dari tabel.
    whatsappDeliveryStats: defineTable({
      key: v.string(),
      queued: v.number(),
      sent: v.number(),
      delivered: v.number(),
      failed: v.number(),
      updatedAt: v.number(),
    }).index("byKey", ["key"]),

    // Percakapan WhatsApp yang masuk lewat webhook. Satu baris per nomor, bukan
    // satu baris per pesan: dashboard hanya perlu tahu pesan terakhir dan
    // apakah ada yang belum dibalas, dan overwrite Latest membuat dashboard
    // tidak tumbuh tanpa batas.
    whatsappThreads: defineTable({
      phone: v.string(),
      userId: v.optional(v.id("users")),
      providerMessageId: v.string(),
      lastInboundAt: v.number(),
      lastInboundBody: v.string(),
      lastInboundKind: v.string(),
      unread: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byPhone", ["phone"])
      .index("byUser", ["userId"]),

    // Percobaan masuk ke ruang /admin lewat passcode. `key` adalah hash dari
    // deviceId + IP + email, jadi indeks tidak menyimpan identitas mentah
    // sekaligus rate limit tidak bisa ditelusuri balik ke orangnya.
    //
    // IP mentah TIDAK PERNAH disimpan. Yang ada hanya `ipHash` (untuk
    // korelasi antar percobaan) dan `ipMasked` (untuk dibaca manusia). Field
    // geolokasi hanya terisi bila provider dikonfigurasi; kalau tidak, kosong.
    adminPasscodeAttempts: defineTable({
      key: v.string(),
      outcome: v.union(v.literal("success"), v.literal("failed"), v.literal("locked")),
      failureReason: v.optional(v.string()),
      emailMasked: v.optional(v.string()),
      // Header versi lama, dipertahankan supaya baris lama tetap terbaca.
      reportedIp: v.optional(v.string()),
      ipHash: v.optional(v.string()),
      ipMasked: v.optional(v.string()),
      ipSource: v.optional(v.string()),
      country: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      networkType: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      browser: v.optional(v.string()),
      browserVersion: v.optional(v.string()),
      os: v.optional(v.string()),
      osVersion: v.optional(v.string()),
      deviceType: v.optional(v.string()),
      timezone: v.optional(v.string()),
      locale: v.optional(v.string()),
      platform: v.optional(v.string()),
      viewport: v.optional(v.string()),
      devicePixelRatio: v.optional(v.number()),
      touchPoints: v.optional(v.number()),
      route: v.optional(v.string()),
      returnTo: v.optional(v.string()),
      referrer: v.optional(v.string()),
      acceptLanguage: v.optional(v.string()),
      sessionFingerprint: v.optional(v.string()),
      requestId: v.optional(v.string()),
      attemptNumber: v.optional(v.number()),
      // Hasil resolusi IP di lapisan server. Alamat lengkap tetap tidak
      // disimpan; yang dicatat adalah seberapa kuat sumbernya, supaya operator
      // tahu sebuah IP benar-benar diamati edge atau hanya Percaya rantai proxy.
      ipFamily: v.optional(v.string()),
      ipTrust: v.optional(v.string()),
      proxyDetected: v.optional(v.boolean()),
      chainLength: v.optional(v.number()),
      mappedFromIpv6: v.optional(v.boolean()),
      signals: v.optional(v.array(v.string())),
      userId: v.optional(v.id("users")),
      // Pengikat ke sesi Convex Auth yang summarised oleh percobaan ini. Yang
      // disimpan hanya hash-nya, bukan id sesi aslinya, supaya Security Desk
      // bisa menampilkan "sesi ini" tanpa pernah memegang pengenal yang bisa
      // dipakai ulang. Pencabutan menandai `sessionRevokedAt` supaya kartu
      // berubah secara reaktif begitu admin menekan tombolnya.
      sessionReference: v.optional(v.string()),
      sessionRevokedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byKey", ["key"])
      .index("byCreatedAt", ["createdAt"])
      .index("byOutcome", ["outcome"])
      .index("bySessionFingerprint", ["sessionFingerprint"])
      .index("byIpHash", ["ipHash"])
      // Dua indeks komposit untuk pemeriksaan gerbang. Keduanya mengubah
      // "baca semua baris lalu saring menurut waktu" menjadi "baca hanya baris
      // di dalam jendelanya" — tepat pada saat tabelnya paling padat, yaitu
      // ketika sedang ada percobaan masuk beruntun.
      .index("byKeyCreatedAt", ["key", "createdAt"])
      .index("byOutcomeCreatedAt", ["outcome", "createdAt"]),

    // Tiket sekali pakai yang diterbitkan setelah passcode admin valid.
    // Hanya hash tiket yang disimpan, bukan token aslinya.
    adminPasscodeTickets: defineTable({
      email: v.string(),
      tokenHash: v.string(),
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
      // Generasi passcode saat tiket diterbitkan. Setelah passcode diubah, tiket
      // dari generasi lama otomatis tidak berlaku, jadi sesi yang sudah membuka
      // gerbang tidak bisa menyelesaikan langkah email dengan passcode lama.
      generation: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("byTokenHash", ["tokenHash"])
      .index("byGeneration", ["generation"]),

    // Konteks request yang ditangkap sekali lewat httpAction. Hanya
    // httpAction Convex yang menerima objek `Request`; action biasa tidak
    // punya akses header sama sekali. Karena itu IP hanya bisa ditangkap di
    // lapisan ini, lalu diteruskan ke verifyAdminPasscode lewat token
    // sekali pakai yang kedaluwarsa dalam 5 menit.
    //
    // Yang kembali ke browser hanya bentuk tersamarnya. IP mentah hanya
    // hidup di sisi server dan langsung diturunkan menjadi hash.
    adminSecurityContexts: defineTable({
      token: v.string(),
      ipHash: v.optional(v.string()),
      ipMasked: v.optional(v.string()),
      ipSource: v.string(),
      userAgent: v.optional(v.string()),
      acceptLanguage: v.optional(v.string()),
      referrer: v.optional(v.string()),
      requestId: v.string(),
      country: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      networkType: v.optional(v.string()),
      ipFamily: v.optional(v.string()),
      ipTrust: v.optional(v.string()),
      proxyDetected: v.optional(v.boolean()),
      chainLength: v.optional(v.number()),
      mappedFromIpv6: v.optional(v.boolean()),
      expiresAt: v.number(),
      createdAt: v.number(),
    })
      .index("byToken", ["token"])
      .index("byExpiresAt", ["expiresAt"]),

    // Presence ringan: kapan seorang pengelola terakhir terlihat di ruang
    // admin. Dipakai supaya audit log bisa menandai "Aktif sekarang" tanpa
    // polling dari klien.
    adminPresence: defineTable({
      userId: v.id("users"),
      sessionFingerprint: v.optional(v.string()),
      route: v.optional(v.string()),
      lastSeenAt: v.number(),
      // Konteks server untuk "Sesi Anda". Tetap bentuk tersamar: ipHash untuk
      // korelasi, ipMasked untuk dibaca. Alamat lengkap tidak pernah disimpan.
      ipHash: v.optional(v.string()),
      ipMasked: v.optional(v.string()),
      ipSource: v.optional(v.string()),
      ipFamily: v.optional(v.string()),
      requestId: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      browser: v.optional(v.string()),
      os: v.optional(v.string()),
      deviceType: v.optional(v.string()),
      timezone: v.optional(v.string()),
      firstSeenAt: v.optional(v.number()),
      signedInAt: v.optional(v.number()),
      // Hash id sesi, supaya panel "Sesi Anda" bisa tahu ia sedang berjalan
      // di perangkat yang sama dengan kartu Security Desk mana.
      sessionReference: v.optional(v.string()),
    })
      .index("byUser", ["userId"])
      .index("byLastSeenAt", ["lastSeenAt"]),

    // Pengikat percobaan login berhasil ke sesi Convex Auth yang sebenarnya.
    //
    // Percobaan "berhasil" dicatat saat passcode cocok, jadi saat itu BELUM
    // ada sesi — email OTP dan sign-in baru terjadi sesudahnya. Karena itu
    // asosiasi ini dibuat belakangan, saat perangkat sudah benar-benar masuk
    // dan sesi aslinya bisa dibaca dari JWT yang ditandatangani server
    // (`userId|authSessions._id`). Klien tidak pernah mengirim id sesi:
    // kalau begitu, nilainya bisa dipalsukan.
    //
    // Tabel ini sengaja terpisah dari `adminPasscodeAttempts` karena yang ini
    // tidak boleh ikut terpangkas sementara sesinya masih hidup.
    adminSessionBindings: defineTable({
      attemptId: v.id("adminPasscodeAttempts"),
      userId: v.id("users"),
      sessionId: v.id("authSessions"),
      // SHA-256 dari id sesi. Inilah satu-satunya bentuk sesi yang keluar ke
      // UI; id aslinya tetap di server.
      sessionReference: v.string(),
      sessionFingerprint: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("byAttempt", ["attemptId"])
      .index("byUser", ["userId"])
      .index("bySession", ["sessionId"]),

    // Sesi yang dicabut admin dari Security Desk.
    //
    // Daftar cabut inilah yang membuat pencabutan berlaku SEKETIKA. Menghapus
    // baris `authSessions` saja tidak cukup: access token yang sudah terbit
    // tetap sah sampai `exp`-nya (1 jam), karena JWT-nya stateless. Setiap
    // permintaan yang melewati `requireUser` mengecek tabel ini, jadi perangkat
    // yang dicabut ditolak pada permintaan berikutnya juga. Id sesi bertahan
    // lintas refresh token, jadi daftar ini juga bertahan setelah token
    // kedaluwarsa — bukan sekadar kedaluwarsa satu jam.
    revokedAdminSessions: defineTable({
      sessionId: v.id("authSessions"),
      userId: v.id("users"),
      attemptId: v.optional(v.id("adminPasscodeAttempts")),
      reason: v.optional(v.string()),
      revokedAt: v.number(),
      revokedBy: v.optional(v.id("users")),
    })
      .index("bySession", ["sessionId"])
      .index("byUser", ["userId"]),

    // Passcode admin hasil rotasi dari dalam aplikasi.
    //
    // Sebelumnya hash hanya hidup di environment, jadi satu-satunya cara
    // mengganti passcode adalah menulis environment dari luar aplikasi. Baris
    // di sini membuat rotasi bisa dilakukan admin yang sedang masuk, tanpa
    // mengubah arsitektur: yang disimpan tetap hash PBKDF2, tidak pernah
    // passcode apa adanya.
    //
    // `generation` naik setiap kali passcode berubah. Semua tiket gerbang dari
    // generasi lama otomatis tidak berlaku, sehingga sesi yang sudah memegang
    // tiket sebelum rotasi tidak bisa menyelesaikan langkah verifikasi email.
    adminPasscodeConfig: defineTable({
      hash: v.string(),
      generation: v.number(),
      source: v.union(v.literal("env"), v.literal("rotated")),
      updatedAt: v.number(),
      updatedBy: v.optional(v.id("users")),
    }),





    // Observability aplikasi. Satu baris per bentuk kegagalan yang berbeda,
    // bukan satu baris per kejadian: kejadian berulang dihitung lewat
    // `occurrences`, sehingga tabel ini tidak tumbuh tanpa batas.
    errorReports: defineTable({
      reportId: v.string(),
      fingerprint: v.string(),
      severity: v.union(
        v.literal("info"),
        v.literal("warning"),
        v.literal("error"),
        v.literal("critical"),
      ),
      status: v.union(
        v.literal("open"),
        v.literal("acknowledged"),
        v.literal("resolved"),
        v.literal("ignored"),
      ),
      errorCode: v.string(),
      title: v.string(),
      message: v.string(),
      userMessage: v.optional(v.string()),
      feature: v.string(),
      operation: v.string(),
      source: v.union(v.literal("client"), v.literal("server"), v.literal("webhook")),
      route: v.optional(v.string()),
      component: v.optional(v.string()),
      requestId: v.optional(v.string()),
      provider: v.optional(v.string()),
      providerCode: v.optional(v.string()),
      providerMessage: v.optional(v.string()),
      userRef: v.optional(v.string()),
      browser: v.optional(v.string()),
      os: v.optional(v.string()),
      stack: v.optional(v.string()),
      context: v.optional(v.any()),
      retryable: v.boolean(),
      recommendedAction: v.string(),
      environment: v.string(),
      occurrences: v.number(),
      firstSeenAt: v.number(),
      lastSeenAt: v.number(),
      alertStatus: v.union(
        v.literal("skipped"),
        v.literal("queued"),
        v.literal("sent"),
        v.literal("blocked"),
        v.literal("failed"),
      ),
      alertReason: v.optional(v.string()),
      alertCode: v.optional(v.string()),
      alertAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byReportId", ["reportId"])
      .index("byFingerprint", ["fingerprint"])
      .index("bySeverity", ["severity"])
      .index("byStatus", ["status"])
      .index("byLastSeenAt", ["lastSeenAt"])
      .index("byAlertStatus", ["alertStatus"]),

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
