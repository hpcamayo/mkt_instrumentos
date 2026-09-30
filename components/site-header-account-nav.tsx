import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
export function SiteHeaderAccountNav({ authenticated, storeOwner }: { authenticated: boolean; storeOwner: boolean }) {
  if (authenticated) {
    return (
      <li>
        <Link
          href="/mi-cuenta"
          className={buttonClasses({ variant: "onDark", size: "sm" })}
        >
          {storeOwner ? "Mi tienda" : "Mi cuenta"}
        </Link>
      </li>
    );
  }

  return (
    <>
      <li>
        <Link
          href="/login"
          className={buttonClasses({ variant: "onDark", size: "sm" })}
        >
          Ingresar
        </Link>
      </li>
      <li>
        <Link
          href="/registro/vendedor"
          className={buttonClasses({ variant: "onDark", size: "sm", className: "border-transparent" })}
        >
          Crear cuenta
        </Link>
      </li>
    </>
  );
}
