import { Card, CardContent } from "@/components/ui/card";
import { BrandMascot } from "@/components/brand-mascot";
import { focusRing } from "@/lib/focus-ring";

export function EmptyStateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
      <CardContent className="flex flex-1 flex-col items-center py-8 text-center">
        <BrandMascot state="empty" size="md" animated={false} className="mx-auto" />
        <p className="mt-4 text-lg font-black text-slate-950">{title}</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-600">{body}</p>
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
        >
          {actionLabel}
        </button>
      </CardContent>
    </Card>
  );
}
