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
      // FASE 9.2 - F-05 opsi ketiga: nama yang tampil di papan permintaan
      // publik. Sengaja TERPISAH dari `name`: `name` milik akun dan dipakai
      // panel admin, audit log, dan alur undangan staff. Menimpanya akan
      // mengubah tiga hal itu tanpa disengaja. Field ini hanya boleh berisi
      // tebakan dari email atau koreksi eksplisit pengguna, tidak pernah
      // nilai yang diketik saat pendaftaran.
      publicName: v.optional(v.string()),
    })
      .index("email", ["email"])
      // FASE 9.1 - F-14. Satu indeks supaya pemeriksaan "blob ini adalah foto
      // profil orang lain" tidak memakai filter atas seluruh tabel `users`.
      // Field ini opsional, jadi indeks hanya memuat baris yang punya foto.
      .index("byProfileImageStorageId", ["profileImageStorageId"]),

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
      // FASE 10 - Privasi nomor.
      //
      // `phone` TIDAK LAGI dikirim ke peramban lewat katalog publik. Yang
      // dikirim adalah `contactRef` (pegangan opaque 128-bit) dan bentuk
      // tersamar. Nomor mentah hanya keluar lewat `vendors:getContactHandoff`,
      // yang memeriksa status listing, membatasi laju, dan mencatat jejak.
      //
      // Optional selama migrasi: baris lama belum punya nilai sampai
      // `vendors:backfillContactRefs` dijalankan. Selama itu, listing lama
      // tampil tanpa tombol WhatsApp alih-alih memuntahkan nomor.
      contactRef: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("bySlug", ["slug"])
      .index("byStatus", ["status"])
      .index("byLandmark", ["landmark"])
      .index("byOwner", ["ownerId"])
      .index("byPhotoId", ["photoId"])
      // Resolusi `contactRef` -> listing harus lewat indeks, bukan pindai.
      .index("byContactRef", ["contactRef"]),
      // Indeks ini ditambah di Fase 9 untuk satu alasan: `vendors:getImageUrl`
      // harus bisa MEMBUKTIKAN bahwa sebuah storage id adalah foto publik
      // listing aktif, bukan sekadar memercayai pemanggil yang mengetahuinya.
      // Tanpa indeks, satu-satunya cara adalah memindai seluruh tabel pada
      // setiap permintaan gambar - persis yang tidak boleh terjadi di jalur
      // yang paling sering dipanggil halaman profil.

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
      .index("byCreatedAt", ["createdAt"])
      // Satu ulasan per penulis per listing. Tanpa indeks ini, "sudah pernah
      // menilai" hanya bisa dijawab dengan membaca seluruh ulasan vendor.
      .index("byVendorAuthor", ["vendorId", "authorId"]),

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
      .index("byVendor", ["vendorId"])
      // FASE 9.1 - F-12. Index ini dibuat untuk batas laju `submitFeedback`,
      // yang tidak punya identitas server untuk dichasetiap pengunjung. Dengan
      // indeks (kind, createdAt) satu pembacaan cukup `.take(N + 1)` pada satu
      // rentang satu jam: bounded, tanpa memindai tabel notifikasi yang juga
      // dipakai pengirim pesan warga.
      .index("byKindCreatedAt", ["kind", "createdAt"]),

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
      .index("byStorageId", ["storageId"])
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
      // FASE 16 - nomor warga tidak lagi disimpan polos.
      //
      // `whatsappPhone` dipertahankan HANYA untuk membaca baris lama selama
      // migrasi. Setelah `migrateResidentPhones` dijalankan, kolom ini kosong
      // pada baris yang sudah dimigrasi dan tidak boleh ditulis lagi.
      whatsappPhone: v.optional(v.string()),
      // Bentuk terenkripsi (`bk1.<iv>.<ciphertext>`). Yang sebenarnya disimpan.
      whatsappPhoneEnc: v.optional(v.string()),
      // HMAC satu arah, untuk pencarian lewat indeks. Tidak bisa dibalik
      // menjadi nomor, jadi bocor storage tidak langsung berarti bocor PII.
      whatsappPhoneKey: v.optional(v.string()),
      whatsappOptInAt: v.optional(v.number()),
      areaUpdates: v.optional(v.boolean()),
      requestUpdates: v.optional(v.boolean()),
      updatedAt: v.number(),
    })
      .index("byUser", ["userId"])
      // Chat masuk dari webhook hanya membawa nomor, jadi nomor harus bisa
      // dicari tanpa scan seluruh tabel preferensi.
      .index("byPhone", ["whatsappPhone"])
      // Indeks yang DIPAKAI setelah migrasi. Dipisah dari `byPhone` supaya
      // kedua skema bisa hidup berdampingan tanpa saling menimpa.
      .index("byPhoneKey", ["whatsappPhoneKey"]),

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
      // FASE 16 - lihat `notificationPreferences`. `whatsappPhone` hanya untuk
      // baris lama; bentuk yang dipakai going forward adalah `...Enc` + `...Key`.
      whatsappPhone: v.optional(v.string()),
      whatsappPhoneEnc: v.optional(v.string()),
      whatsappPhoneKey: v.optional(v.string()),
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
      .index("byRequester", ["requesterId"])
      // FASE 9.1 - F-14. Bukti klaim adalah dokumen pribadi warga, jadi storage
      // id-nya tidak boleh bisa dipasang sebagai foto listing publik. Satu
      // indeks membuat larangan itu satu pembacaan, bukan pemindaian tabel.
      .index("byEvidenceStorageId", ["evidenceStorageId"]),

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
      .index("byVendor", ["vendorId"])
      // Rentang (anonymousId, createdAt) untuk pembatasan laju per peramban
      // anonim. Tanpa indeks ini, rate limit harus memindai tabel peristiwa —
      // persis pemborosan I/O yang Fase 2 hapus.
      .index("byAnonymousCreatedAt", ["anonymousId", "createdAt"]),

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

    // Buku besar handoff kontak publik (FASE 10).
    //
    // Satu baris per permintaan tautan wa.me yang DITERIMA server. Baris ini
    // tidak pernah menyimpan nomor: hanya siapa yang meminta, pegangan mana,
    // dan kapan. Gunanya murni pembatasan laju + jejak audit.
    //
    // Sifat throttle: `userId` adalah userId Convex Auth ketika pemanggil punya
    // sesi. Karena field-nya opsional, kuota ditegakkan dua jalur (lihat
    // catatan di bawah tabel). Baris yang sudah melewati jendela dihapus
    // sendiri oleh pemanggil di awal setiap panggilan, jadi volumenya terikat
    // oleh kuota per akun, bukan oleh uptime. Tidak perlu cron untuk
    // membersihkannya.
    contactHandoffs: defineTable({
      // OPSIONAL dengan sengaja.
      //
      // Dulu skrip ini mewajibkan `userId` dengan alasan "identity selalu
      // ada". Itu benar secara teknis dan salah secara produk: pengunjung yang
      // baru membuka halaman belum tentu punya sesi Convex Auth, dan tombol
      // WhatsApp yang menolak mereka karena belum "teridentifikasi" adalah
      // tombol mati - regresi yang jauh lebih mahal daripada risiko yang
      // dipikirkannya dilindungi.
      //
      // Jadi kuota ditegakkan dua jalur. Kalau identitas ada, batasnya per
      // akun. Kalau tidak, batasnya per `contactRef` - dan itu cukup, karena
      // `contactRef` sendiri tidak bisa ditebak.
      userId: v.optional(v.id("users")),
      contactRef: v.string(),
      createdAt: v.number(),
    })
      // Rentang (userId, createdAt) untuk bounded read: satu akun per jendela.
      .index("byUserCreatedAt", ["userId", "createdAt"])
      // Jalur tanpa identitas: satu listing per jendela.
      .index("byContactRefCreatedAt", ["contactRef", "createdAt"]),

    whatsappDeliveries: defineTable({
      deliveryKey: v.string(),
      // Kosong untuk kiriman sistem (alert bug ke admin). Alert admin bukan
      // notifikasi warga, jadi tidak boleh ikut menghitung atau menghabiskan
      // kuota tiga pesan per hari milik siapa pun.
      userId: v.optional(v.id("users")),
      // `resident` = notifikasi warga, `system` = alert operasional ke admin.
      audience: v.optional(v.union(v.literal("resident"), v.literal("system"))),
      providerMessageId: v.optional(v.string()),
      // `handoff` BUKAN hasil pengiriman. Baris berstatus ini hanya membuktikan
      // bahwa tautan wa.me sudah dibuat dan ditampilkan; tidak ada yang dikirim
      // server-side, jadi tidak ada provider yang mengonfirmasi apa pun. Status
      // ini sengaja terpisah dari `sent`/`delivered` supaya tidak ada jalur
      // kode yang bisa.report hasil kiriman yang tidak pernah terjadi.
      status: v.union(
        v.literal("queued"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("failed"),
        v.literal("handoff"),
      ),
      attempts: v.number(),
      title: v.string(),
      body: v.string(),
      // URL click-to-chat yang sudah jadi, disimpan supaya jejak audit
      // menyimpan persis apa yang sempat ditawakkan ke admin.
      handoffUrl: v.optional(v.string()),
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
      // Penghitung terpisah untuk handoff. Sengaja TIDAK digabung ke empat
      // angka di atas: mencampur "tautan dibuat" ke dalam "terkirim" akan
      // mengubah makna angka yang sudah dibacadashboard.
      handoff: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("byKey", ["key"]),

    // Pemetaan sha256 → blob storage.
    //
    // Tabel `_storage` milik Convex tidak bisa diindeks dari schema kita, jadi
    // dedup unggahan perlu peta sendiri: satu baris per blob yang MASUK lewat
    // jalur unggah kita. Blob yang sama tidak pernah disimpan dua kali, dan
    // `storageId` yang sudah ada dipakai ulang. Penting: baris ini HANYA peta,
    // bukan pemilik blob — blob hanya boleh dihapus kalau TIDAK ada baris
    // mapping yang menunjuknya (lihat `pruneOrphanStorage`), supaya penghapusan
    // foto lama tidak memicu pengunggahan ulang blob yang sama di lain waktu.
    uploadedBlobs: defineTable({
      sha256: v.string(),
      storageId: v.string(),
      size: v.number(),
      createdAt: v.number(),
      lastUsedAt: v.number(),
    })
      .index("bySha256", ["sha256"])
      .index("byStorageId", ["storageId"])
      .index("byLastUsed", ["lastUsedAt"]),

    // Cadangan data mingguan (satu dokumen JSON per run).
    //
    // Retensi KITA menghapus data secara rutin, jadi cadangan berkala bukan
    // lagi opsional. Satu dokumen berisi ringkasan tabel penting dalam bentuk
    // JSON; blob-nya disimpan di `_storage` (private, tanpa URL publik).
    // Metadata laporan di `backupRuns` supaya backup terbaru bisa ditemukan
    // tanpa memindai storage.
    backupRuns: defineTable({
      weekKey: v.string(),
      storageId: v.string(),
      tableCounts: v.any(),
      bytes: v.number(),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      status: v.union(v.literal("ok"), v.literal("partial")),
    })
      .index("byWeek", ["weekKey"])
      .index("byStorageId", ["storageId"]),

    // Percakapan WhatsApp yang masuk lewat webhook. Satu baris per nomor, bukan
    // satu baris per pesan: dashboard hanya perlu tahu pesan terakhir dan
    // apakah ada yang belum dibalas, dan overwrite Latest membuat dashboard
    // tidak tumbuh tanpa batas.
    whatsappThreads: defineTable({
      // FASE 16 - `phone` masih ada sebagai kolom dan sebagai pengenal baris,
      // jadi migrasinya butuh perhatian lebih: baris diidentifikasi lewat
      // nomor, jadi nomor tidak bisa hilang sebelum semua pembacaan dialihkan.
      // Urutannya: tulis kolom baru dulu, alihkan pembacaan, baru kosongkan
      // `phone` pada langkah terpisah yang dijalankan manual.
      phone: v.string(),
      phoneEnc: v.optional(v.string()),
      phoneKey: v.optional(v.string()),
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
      .index("byPhoneKey", ["phoneKey"])
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
      .index("byExpiresAt", ["expiresAt"])
      // FASE 6: rate limit route konteks dihitung dari baris yang sudah ada,
      // bukan dari tabel penghitung terpisah. Baris ini age-nya paling lama 5
      // menit, jadi satu indeks komposit (ipHash, createdAt) sudah cukup untuk
      // menghitung permintaan satu sumber IP dalam satu menit.
      .index("byIpHashCreatedAt", ["ipHash", "createdAt"]),

    // Penghitung penolakan untuk aturan deteksi yang butuh JUMLAH.
  //
  // `recordIncidentWithin` memutuskan dari berapa banyak kejadian di dalam
  // jendela, dan jumlah itu harus berasal dari data nyata. Tabel ini adalah
  // data itu: satu baris kecil per penolakan, dibaca lewat indeks komposit per
  // subjek. Tanpa tabel ini, satu insiden berarti satu baris per percobaan.
  //
  // Isinya sengaja tidak menyimpan nilai yang bisa dipakai ulang: untuk
  // storage id hanya sidik hash-nya, untuk penolakan hak privilege hanya id
  // dokumen pengguna. Baris ini dibaca Security Desk, jadi tidak boleh berisi
  // apa pun yang bisa dipakai pemanggil sebagai kredensial.

  // Penghitung laju per subjek per jendela (FASE 10).
  //
  // Berbeda dengan `securityDenyLog` yang menyimpan SATU KEJADIAN per baris,
  // tabel ini menyimpan satu BARIS PER SUBJUK PER JENDELA yang berisi
  //_running total_. Itu yang membuatnya murah untuk aturan seperti
  // satu takikan tidak menambah satu baris database,
  // dan jumlah kejadian tetap tahu tanpa perlu menghitung apa pun.
  //
  // Jendelanya dipotong ke dalam KUNCI, bukan ke dalam kolom: `key` memuat
  // nomor jendela, jadi jendela yang lewat tidak pernah dibaca dan tidak
  // pernah dibandingkan. Insert untuk jendela baru sekaligus menghapus baris
  // jendela lama milik subjek yang sama, sehingga tabel ini tidak tumbuh
  // seiring waktu tanpa batas.
  securityRateCounters: defineTable({
    key: v.string(),
    ruleKey: v.string(),
    subjectRef: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("byKey", ["key"])
    .index("bySubject", ["ruleKey", "subjectRef"]),

  securityDenyLog: defineTable({
    subjectType: v.union(v.literal("user"), v.literal("storage"), v.literal("invite")),
    /** Hash atau id yang sudah diturunkan; bukan nilai mentah. */
    subjectRef: v.string(),
    ruleKey: v.string(),
    route: v.string(),
    userId: v.optional(v.id("users")),
    sessionReference: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("bySubjectCreatedAt", ["subjectType", "subjectRef", "createdAt"])
    .index("byRuleCreatedAt", ["ruleKey", "createdAt"])
    .index("byCreatedAt", ["createdAt"]),

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
    // ada sesi — verifikasi email di Firebase dan penukaran tiket baru terjadi
    // sesudahnya. Karena itu asosiasi ini dibuat belakangan, saat perangkat
    // sudah benar-benar masuk dan sesi aslinya bisa dibaca dari JWT yang
    // ditandatangani server
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
        // `handoff` berarti tautan wa.me sudah disiapkan untuk laporan ini dan
        // menunggu admin menekan kirim. Ini bukan "terkirim".
        v.literal("handoff"),
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

    // FASE 7 - INSIDEN KEAMANAN.
    //
    // Ini yang membedakan "dashboard keamanan" dari "dashboard hiasan".
    // Sebelum tabel ini ada, aplikasi hanya MENCATAT percobaan (misalnya
    // `adminPasscodeAttempts`), tapi tidak pernah MENYIMPULKAN apa pun: tidak
    // ada yang memberi tahu manusia bahwa sebuah IP sudah gagal lima kali
    // dalam lima belas menit. Operator harus menebak dari daftar mentah, dan
    // tidak ada yang menebak.
    //
    // SATU BARIS PER POLA, BUKAN PER KEJADIAN. Inilah alasan `count`,
    // `firstSeenAt`, dan `lastSeenAt` ada: percobaan beruntun 10.000 kali
    // menghasilkan SATU baris yang bertambah, bukan 10.000 baris. Tabel yang
    // seharusnya memberi peringatan justru akan menenggelamkan peringatannya
    // sendiri kalau ia tumbuh secepat serangannya.
    //
    // ATURAN PEMILIHAN FIELD. Semua yang disimpan di sini dibaca manusia di
    // Security Desk, jadi tabel ini adalah permukaan baca tersendiri dan harus
    // tahan dibaca. Yang TIDAK PERNAH masuk: passcode, password, access token,
    // refresh token, cookie, header Authorization, nomor telepon mentah,
    // secret provider, dan kunci privat. `sanitizeEvidence` di
    // `src/lib/security-rules.ts` menegakkannya, dan `assertSafeEvidence`
    // mengubah pelanggarannya menjadi error - bukan baris yang diam-diam
    // tersimpan.
    //
    // IP juga tidak pernah disimpan apa adanya. Yang ada hanya `ipHash` (untuk
    // mengelompokkan percobaan dari sumber yang sama tanpa bisa dibalik) dan
    // `ipMasked` (untuk dibaca manusia: `103.47.x.x`). IP mentah hidup hanya
    // selama satu permintaan HTTP.
    securityIncidents: defineTable({
      ruleKey: v.string(),
      severity: v.union(
        v.literal("info"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
      status: v.union(
        v.literal("open"),
        v.literal("acknowledged"),
        v.literal("resolved"),
        v.literal("suppressed"),
      ),
      // Jenis subjek yang diserang, misalnya `ip`, `user`, `webhook`.
      subjectType: v.string(),
      // Nilai subjek yang SUDAH diturunkan (hash atau label), bukan identitas
      // mentah. Tidak pernah berisi IP atau nomor telepon apa adanya.
      subjectRef: v.string(),
      userId: v.optional(v.id("users")),
      ipHash: v.optional(v.string()),
      ipMasked: v.optional(v.string()),
      sessionFingerprint: v.optional(v.string()),
      route: v.string(),
      method: v.string(),
      count: v.number(),
      firstSeenAt: v.number(),
      lastSeenAt: v.number(),
      // Keterangan singkat yang sudah disanitasi. Dibuat sebagai daftar supaya
      // satu insiden bisa memuat beberapa cabang kegagalan yang berbeda.
      evidence: v.optional(v.array(v.string())),
      // Jejak siapa yang menutup insiden ini, supaya "sudah ditangani" bisa
      // ditanyakan balik kepada orangnya.
      acknowledgedBy: v.optional(v.id("users")),
      acknowledgedAt: v.optional(v.number()),
      resolvedBy: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
      resolutionNote: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("byRule", ["ruleKey"])
      .index("byStatus", ["status"])
      .index("bySeverity", ["severity"])
      .index("byLastSeenAt", ["lastSeenAt"])
      // Dua indeks komposit yang membuat penggabungan insiden menjadi SATU
      // pembacaan, bukan pemindaian tabel. Inilah yang membuat agregasi tetap
      // murah tepat saat tabelnya paling padat, yaitu ketika sedang diserang.
      .index("byAggregate", ["ruleKey", "subjectType", "subjectRef"])
      .index("byStatusLastSeen", ["status", "lastSeenAt"]),

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
