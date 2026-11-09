import { Shell } from "@/components/Shell";
import { DataProvider } from "@/components/providers/DataProvider";
import { UiProvider } from "@/components/providers/UiProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <DataProvider>
        <Shell>{children}</Shell>
      </DataProvider>
    </UiProvider>
  );
}
