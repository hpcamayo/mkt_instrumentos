import Link from "next/link"
import { Facebook, Instagram, Youtube } from "lucide-react"

const footerLinks = {
  marketplace: [
    { name: "Explorar", href: "/explorar" },
    { name: "Categorías", href: "/categorias" },
    { name: "Tiendas", href: "/tiendas" },
    { name: "Ofertas", href: "/ofertas" },
  ],
  vender: [
    { name: "Publicar anuncio", href: "/publicar" },
    { name: "Guía del vendedor", href: "/guia-vendedor" },
    { name: "Planes premium", href: "/planes" },
    { name: "Calculadora de precios", href: "/calculadora" },
  ],
  soporte: [
    { name: "Centro de ayuda", href: "/ayuda" },
    { name: "Contacto", href: "/contacto" },
    { name: "Seguridad", href: "/seguridad" },
    { name: "Denunciar", href: "/denunciar" },
  ],
  empresa: [
    { name: "Sobre nosotros", href: "/nosotros" },
    { name: "Blog", href: "/blog" },
    { name: "Prensa", href: "/prensa" },
    { name: "Trabaja con nosotros", href: "/empleo" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block">
              <span className="font-serif text-2xl text-foreground">sonora</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              El marketplace de instrumentos musicales más grande de Perú.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Youtube className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-medium text-foreground mb-4">Marketplace</h3>
            <ul className="space-y-3">
              {footerLinks.marketplace.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-foreground mb-4">Vender</h3>
            <ul className="space-y-3">
              {footerLinks.vender.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-foreground mb-4">Soporte</h3>
            <ul className="space-y-3">
              {footerLinks.soporte.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-foreground mb-4">Empresa</h3>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 Sonora. Todos los derechos reservados.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/privacidad" className="hover:text-primary transition-colors">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-primary transition-colors">
              Términos
            </Link>
            <Link href="/cookies" className="hover:text-primary transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
