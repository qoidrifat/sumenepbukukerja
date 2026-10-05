import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardTarget } from "@/hooks/use-dashboard-target";
import { focusRing } from "@/lib/focus-ring";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/profile-dialog";

/**
 * Menu akun di header publik (kanan atas) untuk sesi login.
 *
 * Anonim → null (pemanggil menampilkan CTA publiknya sendiri).
 * Dialog profil dirender DI LUAR <DropdownMenu>: menutup menu tidak boleh
 * mencabut dialog (pelajaran AdminProfileTrigger — lihat komponen
 * profil admin, baris 329-362).
 */
export function AccountMenu() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const target = useDashboardTarget();
  const profile = useQuery(api.users.myProfile, {});
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  if (isLoading) {
    return (
      <span
        role="status"
        aria-label="Memuat menu akun"
        className="block h-12 w-12 rounded-full bg-slate-200 motion-safe:animate-pulse"
      />
    );
  }
  if (!isAuthenticated) return null;

  const displayName = profile?.name?.trim() || user?.name?.trim() || user?.email?.split("@")[0] || "Akun";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu akun ${displayName}`}
          className={`flex min-h-12 min-w-0 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm hover:border-blue-300 hover:bg-blue-50 ${focusRing}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-sm font-black text-white">
            {profile?.imageUrl ? (
              <img src={profile.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              initials || <UserRound className="size-5" aria-hidden="true" />
            )}
          </span>
          <span className="hidden max-w-28 truncate text-sm font-extrabold text-slate-800 min-[420px]:inline">
            {displayName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem disabled={target === null} asChild={target !== null}>
            {target === null ? (
              <span className="flex min-h-12 items-center gap-2"><span>Dashboard</span></span>
            ) : (
              <a href={target} className="flex min-h-12 items-center gap-2">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span>Dashboard</span>
              </a>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setProfileOpen(true)} className="min-h-12">
            <UserRound className="size-4" aria-hidden="true" />
            <span>Profil</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleSignOut()} className="min-h-12">
            <LogOut className="size-4" aria-hidden="true" />
            <span>Keluar</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
