import { useEffect } from "react";
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

/*
 * Layar yang ditampilkan saat sesi ditolak server.
 *
 * Dipisah dari `SessionGateBoundary.tsx` karena berkas itu mengekspor kelas
 * batas error sekaligus mendefinisikan komponen ini di dalamnya. Aturan
 * react-refresh menandai campuran itu; memindahkan komponennya ke berkas
 * sendiri menyelesaikan sebabnya, bukan mematikan aturannya.
 */
export function SessionExpiredScreen({ udf }: { udf: string }) {
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
