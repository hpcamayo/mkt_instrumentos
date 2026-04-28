"use client"

import { useState } from "react"
import { Search, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="font-serif text-2xl tracking-tight text-foreground">sonora</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar instrumentos..."
                className="h-10 w-72 rounded-full bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Link href="/categorias" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Categorías
            </Link>
            <Link href="/tiendas" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Tiendas
            </Link>
          </div>

          {/* CTA Button */}
          <div className="hidden md:flex md:items-center md:gap-4">
            <Button variant="outline" className="rounded-full text-sm">
              Iniciar sesión
            </Button>
            <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
              Vender
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden rounded-full p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-b border-border"
          >
            <div className="px-4 py-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar instrumentos..."
                  className="h-10 w-full rounded-full bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Link href="/categorias" className="block text-sm font-medium text-foreground py-2">
                Categorías
              </Link>
              <Link href="/tiendas" className="block text-sm font-medium text-foreground py-2">
                Tiendas
              </Link>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-full text-sm">
                  Iniciar sesión
                </Button>
                <Button className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm">
                  Vender
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
