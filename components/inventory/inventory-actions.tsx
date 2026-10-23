"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { ControlStockSheet, NewSkuSheet } from "@/components/inventory/sku-forms";
import { PageNotice } from "@/components/page-notice";
import { buttonClasses } from "@/components/ui/button";

// The page's one primary action (design §13.1).
export function NewSkuButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className={buttonClasses()} aria-haspopup="dialog" aria-keyshortcuts="n" data-shortcut="nuevo-sku" onClick={() => setOpen(true)}><Plus aria-hidden />Nuevo SKU</button>
      {open ? <NewSkuSheet onClose={() => { setOpen(false); requestAnimationFrame(() => ref.current?.focus()); }} /> : null}
    </>
  );
}

// "Controlar stock" on a store publication that is not in Inventario yet (design §6.1).
export function ControlStockButton({ listing }: { listing: { id: string; title: string } }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="dialog" className="link font-semibold" onClick={() => { setMessage(""); setOpen(true); }}>Controlar stock</button>
      {message ? <div className="basis-full"><PageNotice kind="success" message={message} /></div> : null}
      {open ? (
        <ControlStockSheet
          listing={listing}
          onClose={() => { setOpen(false); requestAnimationFrame(() => ref.current?.focus()); }}
          onDone={(text) => { setOpen(false); setMessage(text); }}
        />
      ) : null}
    </>
  );
}
