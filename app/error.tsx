"use client";

import { useEffect } from "react";
import { ErrorPage } from "@/components/error-page";

// Unexpected errors inside the site shell: standard header and slim footer around the 500 body. The error
// itself goes to the console (and the server logs), never to the page.
export default function ErrorBoundaryPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPage
      title="Algo salió mal"
      message="Vuelve a intentarlo en unos minutos."
      searchId="busqueda-error"
    />
  );
}
