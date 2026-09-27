import type { ReactNode } from "react";

export function LogoutButton({
  className,
  children = "Cerrar sesión",
}: {
  className: string;
  children?: ReactNode;
}) {
  return (
    <form action="/logout" method="post">
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
