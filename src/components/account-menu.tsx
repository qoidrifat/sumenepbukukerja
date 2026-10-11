import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardTarget } from "@/hooks/use-dashboard-target";
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
          className="liquid-acct"
        >
          <span className="liquid-avatar">
            {profile?.imageUrl ? (
              <img src={profile.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              initials || <UserRound className="size-4" aria-hidden="true" />
            )}
          </span>
          <span className="liquid-acct-name">
            {displayName}
          </span>
          <svg
            className="liquid-chev"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={12}
          className="min-w-[17.5rem] rounded-[20px] border-2 border-slate-900/12 bg-white/78 p-1.5 shadow-[0_24px_48px_-16px_rgb(15_23_42/18%),0_8px_16px_-8px_rgb(15_23_42/10%),inset_0_1px_1px_rgb(255_255_255/65%)] backdrop-blur-[36px] backdrop-saturate-[175%]"
        >
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
