"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NoticeIcon, noticeBodyClassName, noticeClassName } from "@/components/ui/notice";

// Result of a page action: takes focus and scrolls into view so keyboard and screen-reader users hear it.
export function PageNotice({
  kind,
  message,
  children,
}: {
  kind: "success" | "error" | "info" | "warning";
  message: string;
  children?: ReactNode;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message || !noticeRef.current) return;
    noticeRef.current.focus({ preventScroll: true });
    noticeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [kind, message]);

  const tone = kind === "error" ? "danger" : kind;
  return (
    <div
      ref={noticeRef}
      tabIndex={-1}
      role={kind === "error" ? "alert" : "status"}
      className={noticeClassName(tone, "")}
    >
      <NoticeIcon tone={tone} />
      <div className={noticeBodyClassName}>
        <p>{message}</p>
        {children}
      </div>
    </div>
  );
}
