import { Suspense } from "react";
import { TicketsView } from "@/components/tickets/TicketsView";

export default function Page() {
  // TicketsView reads ?open= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <TicketsView />
    </Suspense>
  );
}
