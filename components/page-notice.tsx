"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PageNotice({
  kind,
  message,
  children,
}: {
  kind: "success" | "error" | "info";
  message: string;
  children?: ReactNode;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message || !noticeRef.current) return;
    noticeRef.current.focus({ preventScroll: true });
    noticeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [kind, message]);

  const classes = kind === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800 focus:ring-emerald-600/30"
    : kind === "error"
      ? "border-red-200 bg-red-50 text-red-800 focus:ring-red-600/30"
      : "border-laria-blue/25 bg-laria-blue/10 text-laria-text-soft focus:ring-laria-blue/30";

  return (
    <div
      ref={noticeRef}
      tabIndex={-1}
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-md border p-4 text-sm outline-none focus:ring-2 ${classes}`}
    >
      <p>{message}</p>
      {children}
    </div>
  );
}
