import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { isCatalogHref } from "@/lib/shell";

// Shell navigation links. Catalog URLs (/listados, with or without a query) are native links, so the page loads
// fully (lib/shell.ts isCatalogHref); category landings and every other route stay client links.
export function ShellLink({ href, children, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children: ReactNode }) {
  if (isCatalogHref(href)) {
    return <a href={href} {...props}>{children}</a>;
  }
  return <Link href={href} {...props}>{children}</Link>;
}
