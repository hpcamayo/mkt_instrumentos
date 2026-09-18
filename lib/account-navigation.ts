export type AccountNavigationItem = {
  href: string;
  label: string;
  icon: "summary" | "listings" | "publish" | "store" | "inventory" | "analytics" | "notifications" | "profile" | "security" | "favorites";
  exact?: boolean;
};

export function getAccountNavigationItems(accountType: "seller" | "store_owner", hasStore: boolean): AccountNavigationItem[] {
  if (accountType === "store_owner") {
    return [
      { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
      { href: "/mi-cuenta/tienda", label: hasStore ? "Mi tienda" : "Solicitud de tienda", icon: "store", exact: true },
      ...(hasStore ? [
        { href: "/mi-cuenta/tienda/inventario", label: "Inventario", icon: "inventory" } as const,
        { href: "/mi-cuenta/tienda/publicar", label: "Publicar producto", icon: "publish" } as const,
        { href: "/mi-cuenta/tienda/estadisticas", label: "Estadísticas", icon: "analytics" } as const,
      ] : []),
      { href: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: "notifications" },
      { href: "/mi-cuenta/favoritos", label: "Favoritos", icon: "favorites" },
      { href: "/mi-cuenta/perfil", label: "Perfil", icon: "profile" },
      { href: "/mi-cuenta/seguridad", label: "Seguridad", icon: "security" },
    ];
  }
  return [
    { href: "/mi-cuenta", label: "Resumen", icon: "summary", exact: true },
    { href: "/mi-cuenta/publicaciones", label: "Mis publicaciones", icon: "listings" },
    { href: "/mi-cuenta/publicar", label: "Publicar instrumento", icon: "publish" },
    { href: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: "notifications" },
    { href: "/mi-cuenta/favoritos", label: "Favoritos", icon: "favorites" },
    { href: "/mi-cuenta/perfil", label: "Perfil", icon: "profile" },
    { href: "/mi-cuenta/seguridad", label: "Seguridad", icon: "security" },
  ];
}

export function accountItemIsActive(pathname: string, item: Pick<AccountNavigationItem, "href" | "exact">) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getHeaderNavigation({ authenticated, storeOwner, hasStore }: { authenticated: boolean; storeOwner: boolean; hasStore: boolean }) {
  return [
    { href: "/", label: "Inicio", primary: false },
    { href: "/listados", label: "Listados", primary: false },
    ...(storeOwner
      ? [{ href: hasStore ? "/mi-cuenta/tienda/publicar" : "/mi-cuenta/tienda", label: hasStore ? "Publicar producto" : "Solicitud de tienda", primary: hasStore }]
      : [{ href: authenticated ? "/mi-cuenta/publicar" : "/vender", label: "Vender", primary: true }]),
    ...(!authenticated ? [{ href: "/registro/tienda", label: "Para tiendas", primary: false }] : []),
  ];
}
