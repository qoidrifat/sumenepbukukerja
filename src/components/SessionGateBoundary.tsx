import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogIn, RefreshCw } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { sessionGateFailure } from "@/lib/error-reporting";

/*
 * Menerjemahkan penolakan sesi menjadi layar masuk, bukan "gangguan sistem".
 *
 * Kenapa ini perlu, dan kenapa filter pelaporan saja tidak cukup:
 *
 *  Convex melaporkan APA PUN yang dilempar di dalam query sebagai `Server
 *  Error`. Guard otorisasi (`requireUser`, `requireStaff`) melempar ConvexError,
 *  jadi "tidak punya sesi" dan "kode-nya benar-benar rusak" sampai ke peramban
 *  dengan bentuk yang sama persis. Di produksi kalimat aslinya bahkan tidak
 *  dikirim, hanya amplopnya:
 *
 *    [CONVEX Q(vendors:listForAdmin)] [Request ID: ...] Server Error
 *
 *  Tanpa batas di sini, `RootErrorBoundary` memperlakukan hal yang paling
 *  biasa di aplikasi - sesi yang kedaluwarsa - sebagai kegagalan total, dan
 *  pengunjung melihat "Aplikasi mengalami gangguan total dan dimuat ulang".
 *  Gejalanya sudah tercatat: lima laporan `critical` untuk tiga query yang
 *  hanya gagal karena tidak ada sesi, plus satu aset basi.
 *
 * Batas ini HARUS berada DI DALAM `RootErrorBoundary`, bukan menggantikannya.
 * Error yang tidak dikenali tetap berarti gangguan dan tetap dilaporkan - hanya
 * penolakan sesi yang tertangkap di sini.
 *
 * BAHAYA YANG DIHINDARI DI BAWAH INI, dan alasannya sangat spesifik:
 *
 *  Batas yang `render`-nya mengembalikan `this.props.children` lagi saat
 *  error-nya BUKAN penolakan sesi akan MEMUTAR SENDIRI. React sudah
 *  melepas subtree yang gagal; merender anak yang sama berarti React
 *  mencoba menampilkannya lagi, error yang sama terlempar lagi, dan
 *  `getDerivedStateFromError` dipanggil lagi - tanpa henti, membakar CPU
 *  tanpa menghasilkan apa pun yang bisa dilihat pengguna.
 *
 *  Karena itu error yang bukan penolakan sesi justru DILEMPARKAN ULANG dari
 *  `componentDidCatch`. React meneruskannya ke batas di atasnya, jadi error
 *  asli tetap sampai ke `RootErrorBoundary` dan tetap dilaporkan seperti
 *  seharusnya. Batas ini HANYA menulis layar masuk untuk satu jenis error.
 */
type State = { udf: string | null };

export class SessionGateBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { udf: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return { udf: sessionGateFailure(message) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const udf = sessionGateFailure(message);
    if (!udf) {
      // Bukan penolakan sesi: teruskan ke RootErrorBoundary. Melempar ulang
      // di sini satu-satunya cara supaya React tidak menggambar anak yang sama
      // lagi dan masuk ke putaran render tanpa akhir.
      throw error;
    }
    // Jejaknya di console saja. Melaporkannya ke server justru bagian yang
    // membuat dashboard tertutupi masalah sungguhan.
    console.info(
      `[SESSION] Sesi tidak berlaku pada ${udf}, menampilkan layar masuk:`,
      message,
      info.componentStack ?? "",
    );
  }

  render() {
    if (this.state.udf) return <SessionExpiredScreen udf={this.state.udf} />;
    return this.props.children;
  }
}

function SessionExpiredScreen({ udf }: { udf: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

  // Sesi bisa saja kembali sendiri: tab lain baru saja selesai masuk. Satu
  // kali muat ulang otomatis supaya halaman tidak terjebak di layar ini walau
  // tokennya sebenarnya sudah pulih.
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.reload(), 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <LogIn className="size-5 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl">Sesi Anda sudah tidak berlaku</CardTitle>
          <CardDescription>
            Anda pernah masuk di perangkat ini, tetapi sesinya sudah berakhir atau dicabut dari
            Security Desk. Data Anda tidak berubah. Masuk lagi untuk melanjutkan di halaman ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-muted-foreground">
          Halaman menyegarkan sendiri dalam 12 detik.
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => navigate(signInHref)}>
            Masuk lagi
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            Coba muat ulang
          </Button>
        </CardFooter>
        <p className="px-6 pb-4 text-center font-mono text-[11px] text-muted-foreground">{udf}</p>
      </Card>
    </main>
  );
}