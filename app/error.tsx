"use client";

import { useEffect } from "react";
import { ErrorPage, SERVER_ERROR_COPY } from "@/components/error-page";
import { FallbackMain } from "@/components/site-shell";

// Unexpected errors inside the site shell: standard header and slim footer around the 500 body. The error
// itself goes to the console (and the server logs), never to the page.
export default function ErrorBoundaryPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <FallbackMain>
      <ErrorPage {...SERVER_ERROR_COPY} searchId="busqueda-error" />
    </FallbackMain>
  );
}
