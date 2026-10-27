"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { ErrorPage, SERVER_ERROR_COPY } from "@/components/error-page";
import { FallbackMain } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/monitoring/client-errors";

// Unexpected errors inside the site shell: standard header and slim footer around the 500 body. The error
// itself goes to the console (and the server logs) and to Admin > Errores (A13), never to the page. "Reintentar" asks the server for the page
// again and re-renders the failed segment in one transition (reset alone would replay the failed server payload),
// so a passing failure clears in place without losing the address.
export default function ErrorBoundaryPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  useEffect(() => {
    console.error(error);
    reportClientError("boundary", error);
  }, [error]);

  const retry = () => startRetry(() => {
    router.refresh();
    reset();
  });

  return (
    <FallbackMain>
      <ErrorPage {...SERVER_ERROR_COPY} searchId="busqueda-error" action={<Button onClick={retry} loading={retrying} loadingLabel="Reintentando…">Reintentar</Button>} />
    </FallbackMain>
  );
}
