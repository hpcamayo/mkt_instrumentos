export type AccountNavigationItem = {
  href: string;
  label: string;
  icon: "summary" | "listings" | "publish" | "store" | "inventory" | "analytics" | "transactions" | "notifications" | "profile" | "security" | "favorites" | "alerts";
  exact?: boolean;
  // Additional sections that belong to the same navigation entry.
  activePaths?: readonly string[];
};

// Frozen account information architecture, shared by desktop and mobile menus. Labels follow the UX-1 glossary.
const sharedAccountItems: AccountNavigationItem[] = [
  { href: "/mi-cuenta/favoritos", label: "Favoritos", icon: "favorites" },
  { href: "/mi-cuenta/alertas", label: "Alertas", icon: "alerts" },
  { href: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: "notifications" },
  { href: "/mi-cuenta/transacciones", label: "Compras y ventas", icon: "transactions" },
  { href: "/mi-cuenta/perfil", label: "Perfil y seguridad", icon: "profile", activePaths: ["/mi-cuenta/seguridad"] },
];

export function getAccountNavigationItems(accountType: "seller" | "store_owner", hasStore: boolean): AccountNavigationItem[] {
  if (accountType === "store_owner") {
    return [
      { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
      { href: "/mi-cuenta/tienda", label: hasStore ? "Mi tienda" : "Solicitud de tienda", icon: "store", exact: true },
      ...(hasStore ? [
        { href: "/mi-cuenta/tienda/inventario", label: "Inventario", icon: "inventory" } as const,
        { href: "/mi-cuenta/tienda/publicar", label: "Publicar", icon: "publish" } as const,
        { href: "/mi-cuenta/tienda/estadisticas", label: "Estadísticas", icon: "analytics" } as const,
      ] : []),
      ...sharedAccountItems,
    ];
  }
  return [
    { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
    { href: "/mi-cuenta/publicaciones", label: "Mis publicaciones", icon: "listings" },
    { href: "/mi-cuenta/publicar", label: "Publicar", icon: "publish" },
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
] as const;

export function getHeaderNavigation({ authenticated, storeOwner, hasStore }: { authenticated: boolean; storeOwner: boolean; hasStore: boolean }) {
  return [
    { href: "/", label: "Inicio", primary: false },
    { href: "/listados", label: "Listados", primary: false },
    ...(storeOwner
      ? [{ href: hasStore ? "/mi-cuenta/tienda/publicar" : "/mi-cuenta/tienda", label: hasStore ? "Publicar" : "Solicitud de tienda", primary: hasStore }]
      : [{ href: authenticated ? "/mi-cuenta/publicar" : "/vender", label: "Vender", primary: true }]),
    ...(!authenticated ? [{ href: "/registro/tienda", label: "Para tiendas", primary: false }] : []),
  ];
}
