"use client";

import { useEffect } from "react";
import { ErrorPage, SERVER_ERROR_COPY } from "@/components/error-page";

// An error in an Admin page keeps the Admin frame (sidebar and <main> from app/admin/layout.tsx). The error itself
// goes to the console (and the server logs), never to the page.
export default function AdminErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPage {...SERVER_ERROR_COPY} searchId="busqueda-error" />;
}
