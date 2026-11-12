import { Shell } from "@/components/Shell";
import { DataProvider } from "@/components/providers/DataProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
import { UiProvider } from "@/components/providers/UiProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <DataProvider>
        <SyncProvider>
          <Shell>{children}</Shell>
        </SyncProvider>
      </DataProvider>
    </UiProvider>
  );
}
