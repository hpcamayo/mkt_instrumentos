export type AccountNavigationItem = {
  href: string;
  label: string;
  icon: "summary" | "listings" | "publish" | "store" | "inventory" | "payments" | "analytics" | "transactions" | "notifications" | "profile" | "security" | "favorites" | "alerts"
    // Effortless Laria, inventory batch (stock-04): purchase requests.
    | "requests"
    // store-floor (buy-07): try-outs at the store.
    | "tryouts"
    // feature-ideas services (bet-02)
    | "services";
  exact?: boolean;
  // Additional sections that belong to the same navigation entry.
  activePaths?: readonly string[];
};

// Frozen account information architecture, shared by desktop and mobile menus. Labels follow the UX-1 glossary.
const sharedAccountItems: AccountNavigationItem[] = [
  { href: "/mi-cuenta/favoritos", label: "Favoritos", icon: "favorites" },
  { href: "/mi-cuenta/alertas", label: "Alertas", icon: "alerts" },
  { href: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: "notifications" },
  // store-floor (buy-07): a buyer's try-outs live with their purchases.
  { href: "/mi-cuenta/transacciones", label: "Compras y ventas", icon: "transactions", activePaths: ["/mi-cuenta/pruebas"] },
  { href: "/mi-cuenta/perfil", label: "Perfil y seguridad", icon: "profile", activePaths: ["/mi-cuenta/seguridad", "/mi-cuenta/correos"] },
];

// `payments`: the assisted-commerce pilot is on (assistedCommerceEnabled(), read on the server), so a store sees "Pagos"
// (PAY-1, review fix B6). Off, the entry does not exist, like the pages behind it.
export function getAccountNavigationItems(
  accountType: "seller" | "store_owner",
  hasStore: boolean,
  { payments = false }: { payments?: boolean } = {},
): AccountNavigationItem[] {
  if (accountType === "store_owner") {
    return [
      { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
      // store-floor: Garantía y cambios is a store setting; labels and the poster start from Inventario.
      { href: "/mi-cuenta/tienda", label: hasStore ? "Mi tienda" : "Solicitud de tienda", icon: "store", exact: true, activePaths: ["/mi-cuenta/tienda/garantia"] },
      ...(hasStore ? [
        { href: "/mi-cuenta/tienda/inventario", label: "Inventario", icon: "inventory", activePaths: ["/mi-cuenta/tienda/etiquetas"] } as const,
        { href: "/mi-cuenta/tienda/publicar", label: "Publicar", icon: "publish" } as const,
        // store-floor (buy-07)
        { href: "/mi-cuenta/tienda/pruebas", label: "Pruebas", icon: "tryouts" } as const,
        // Effortless Laria, inventory batch (stock-04): "Solicitudes" exists only while purchase requests do (the pilot).
        ...(payments ? [{ href: "/mi-cuenta/tienda/solicitudes", label: "Solicitudes", icon: "requests" } as const] : []),
        // /Effortless Laria, inventory batch
        ...(payments ? [{ href: "/mi-cuenta/tienda/pagos", label: "Pagos", icon: "payments", activePaths: ["/mi-cuenta/tienda/medios-de-pago"] } as const] : []),
        { href: "/mi-cuenta/tienda/estadisticas", label: "Estadísticas", icon: "analytics" } as const,
        // feature-ideas services (bet-02): a store offers services as itself.
        { href: "/mi-cuenta/servicios", label: "Servicios", icon: "services" } as const,
      ] : []),
      ...sharedAccountItems,
    ];
  }
  return [
    { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
    { href: "/mi-cuenta/publicaciones", label: "Mis publicaciones", icon: "listings" },
    { href: "/mi-cuenta/publicar", label: "Publicar", icon: "publish" },
    { href: "/mi-cuenta/estadisticas", label: "Estadísticas", icon: "analytics" },
    // feature-ideas services (bet-02)
    { href: "/mi-cuenta/servicios", label: "Servicios", icon: "services" },
    ...sharedAccountItems,
  ];
}

function pathMatches(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function accountItemIsActive(pathname: string, item: Pick<AccountNavigationItem, "href" | "exact" | "activePaths">) {
  return pathMatches(pathname, item.href, item.exact) || (item.activePaths ?? []).some((path) => pathMatches(pathname, path));
}

export const accountSettingsTabs = [
  { href: "/mi-cuenta/perfil", label: "Perfil" },
  { href: "/mi-cuenta/seguridad", label: "Seguridad" },
  // Accounts batch, save-07.
  { href: "/mi-cuenta/correos", label: "Correos" },
] as const;

// Glossary names of the two account types (docs/design-system.md).
export function accountRoleLabel(accountType: "seller" | "store_owner") {
  return accountType === "store_owner" ? "Tienda" : "Particular";
}

// The header's sell entry (decision N1: the outline button on dark). Store owners keep their own labels:
// "Publicar" once the store exists, "Solicitud de tienda" before. Stores reach store registration from the footer.
export function getSellEntry({ authenticated, storeOwner, hasStore }: { authenticated: boolean; storeOwner: boolean; hasStore: boolean }) {
  if (storeOwner) {
    return hasStore
      ? { href: "/mi-cuenta/tienda/publicar", label: "Publicar" }
      : { href: "/mi-cuenta/tienda", label: "Solicitud de tienda" };
  }
  return { href: authenticated ? "/mi-cuenta/publicar" : "/vender", label: "Vender" };
}
