import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24 safe-top">
      <Toaster />
      {children}
      <BottomNav />
    </div>
  );
}
