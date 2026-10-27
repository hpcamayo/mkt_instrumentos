"use client";

import { MapPin, Pencil, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { inventoryAction, newRequestKey } from "@/lib/inventory-client";
import { citySuggestions, peruRegions } from "@/lib/location";
import { LOCATION_LIMIT, locationPlace, type StoreLocation } from "@/lib/store-locations";
import { numbers } from "@/lib/store-inventory";

// run-02 "Sedes": the store's locations. The first one takes every unit the store has (nothing changes for buyers
// until there are two); the main one is where units go when nobody says where. Archiving moves a location's units to
// another one, and archiving the last one goes back to one stock per SKU.

type Feedback = { kind: "success" | "error"; message: string } | null;
type FormValue = { name: string; region: string; city: string; district: string; address: string; show_address: boolean; opening_hours: string; pickup_enabled: boolean };

const EMPTY: FormValue = { name: "", region: "Lima", city: "Lima", district: "", address: "", show_address: false, opening_hours: "", pickup_enabled: true };

function formFrom(location: StoreLocation | null): FormValue {
  if (!location) return EMPTY;
  return {
    name: location.name,
    region: location.region,
    city: location.city,
    district: location.district ?? "",
    address: location.address ?? "",
    show_address: location.show_address,
    opening_hours: location.opening_hours ?? "",
    pickup_enabled: location.pickup_enabled,
  };
}

function LocationForm({ location, onDone, onCancel }: { location: StoreLocation | null; onDone: (message: string) => void; onCancel: () => void }) {
  const id = useId();
  const [value, setValue] = useState<FormValue>(() => formFrom(location));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<FormValue>) => setValue((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await inventoryAction({ action: "location_save", location_id: location?.id ?? null, fields: value });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(location ? `Guardamos ${value.name.trim()}.` : `Agregamos la sede ${value.name.trim()}.`);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <Field id={`${id}-nombre`} label="Nombre de la sede" hint="Así la ven los compradores, por ejemplo “Miraflores” o “Centro de Lima”.">
        <Input value={value.name} maxLength={60} onChange={(event) => set({ name: event.target.value })} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-region`} label="Región">
          <Select value={value.region} onChange={(event) => set({ region: event.target.value })}>
            {peruRegions.map((region) => <option key={region} value={region}>{region}</option>)}
          </Select>
        </Field>
        <Field id={`${id}-ciudad`} label="Ciudad">
          <Input value={value.city} maxLength={60} list={`${id}-ciudades`} onChange={(event) => set({ city: event.target.value })} />
        </Field>
      </div>
      <datalist id={`${id}-ciudades`}>{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
      <Field id={`${id}-distrito`} label="Distrito" optional>
        <Input value={value.district} maxLength={60} onChange={(event) => set({ district: event.target.value })} />
      </Field>
      <Field id={`${id}-direccion`} label="Dirección" optional hint="Solo se muestra si marcas la casilla de abajo.">
        <Input value={value.address} maxLength={160} onChange={(event) => set({ address: event.target.value })} autoComplete="street-address" />
      </Field>
      <Checkbox
        checked={value.show_address}
        onChange={(event) => set({ show_address: event.target.checked })}
        label="Mostrar la dirección en la página de la tienda y en las publicaciones"
      />
      <Field id={`${id}-horario`} label="Horario" optional hint="Por ejemplo: lun a sáb de 10 a. m. a 7 p. m.">
        <Input value={value.opening_hours} maxLength={300} onChange={(event) => set({ opening_hours: event.target.value })} />
      </Field>
      <Checkbox
        checked={value.pickup_enabled}
        onChange={(event) => set({ pickup_enabled: event.target.checked })}
        label="Se puede recoger aquí"
        description="Quien compra puede elegir esta sede al escribirte por WhatsApp."
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} loadingLabel="Guardando…">{location ? "Guardar sede" : "Agregar sede"}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function ArchiveSheet({ location, others, onClose, onDone }: { location: StoreLocation; others: StoreLocation[]; onClose: () => void; onDone: (message: string) => void }) {
  const id = useId();
  const [moveTo, setMoveTo] = useState(others.find((other) => other.is_primary)?.id ?? others[0]?.id ?? "");
  const [key] = useState(() => newRequestKey("sede-archivar"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const last = others.length === 0;

  async function archive() {
    setBusy(true);
    setError("");
    const result = await inventoryAction<{ moved_units: number; locations_off?: boolean }>({ action: "location_archive", location_id: location.id, move_to: last ? null : moveTo, key });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(result.data.locations_off
      ? "Archivamos la última sede: tu inventario vuelve a tener un solo stock por SKU, con los mismos totales."
      : `Archivamos ${location.name}${result.data.moved_units ? ` y pasamos ${numbers.format(result.data.moved_units)} ${result.data.moved_units === 1 ? "unidad" : "unidades"} a ${others.find((other) => other.id === moveTo)?.name}` : ""}.`);
  }

  return (
    <Sheet
      title={`Archivar ${location.name}`}
      closeLabel="Cerrar"
      layout="responsive"
      onDismiss={onClose}
      footer={(
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" loading={busy} loadingLabel="Archivando…" onClick={archive} disabled={!last && !moveTo}>Archivar sede</Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      )}
    >
      <div className="grid gap-4">
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        {last ? (
          <p className="t-body text-ink">Es tu única sede. Al archivarla, tu inventario vuelve a llevar un solo stock por SKU, con los mismos totales; las publicaciones dejan de mostrar sedes.</p>
        ) : (
          <>
            <p className="t-body text-ink">
              {location.units > 0
                ? `Tiene ${numbers.format(location.units)} ${location.units === 1 ? "unidad" : "unidades"} en ${numbers.format(location.skus)} SKU. Pasan a la sede que elijas; el historial guarda el traslado.`
                : "No tiene unidades."}
              {location.is_primary ? " Es la sede principal: la que elijas pasa a ser la principal." : ""}
            </p>
            <Field id={`${id}-destino`} label="¿A qué sede pasan sus unidades?">
              <Select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
                {others.map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
              </Select>
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function LocationsManager({ locations, writable }: { locations: StoreLocation[]; writable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<StoreLocation | "new" | null>(null);
  const [archiving, setArchiving] = useState<StoreLocation | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function done(message: string) {
    setEditing(null);
    setArchiving(null);
    setFeedback({ kind: "success", message });
    router.refresh();
  }

  async function makePrimary(location: StoreLocation) {
    setBusy(location.id);
    const result = await inventoryAction({ action: "location_primary", location_id: location.id });
    setBusy(null);
    if (!result.ok) setFeedback({ kind: "error", message: result.message });
    else done(`${location.name} es ahora la sede principal.`);
  }

  return (
    <div className="grid gap-4">
      {feedback ? <Notice tone={feedback.kind === "success" ? "success" : "danger"} role={feedback.kind === "success" ? "status" : "alert"}>{feedback.message}</Notice> : null}
      {locations.length ? (
        <ul className="grid gap-3" aria-label="Tus sedes">
          {locations.map((location) => (
            <li key={location.id} className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
              {editing !== "new" && editing?.id === location.id ? (
                <LocationForm location={location} onDone={done} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <h3 className="flex flex-wrap items-center gap-2 t-ui font-semibold text-ink">
                        <MapPin aria-hidden className="h-4 w-4 shrink-0" />
                        {location.name}
                        {location.is_primary ? <Tag tone="accent">Principal</Tag> : null}
                        {location.pickup_enabled ? null : <Tag tone="line">Sin recojo</Tag>}
                      </h3>
                      <p className="t-meta">{locationPlace(location)}{location.address ? ` · ${location.address}${location.show_address ? "" : " (no se muestra)"}` : ""}</p>
                      {location.opening_hours ? <p className="t-meta">{location.opening_hours}</p> : null}
                    </div>
                    <p className="t-ui tabular-nums text-ink">{numbers.format(location.units)} {location.units === 1 ? "unidad" : "unidades"} · {numbers.format(location.skus)} SKU</p>
                  </div>
                  {writable ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" icon={<Pencil aria-hidden />} onClick={() => setEditing(location)}>Editar</Button>
                      {location.is_primary ? null : (
                        <Button variant="secondary" size="sm" icon={<Star aria-hidden />} loading={busy === location.id} loadingLabel="Guardando…" onClick={() => makePrimary(location)}>Hacer principal</Button>
                      )}
                      <Button variant="quiet" size="sm" onClick={() => setArchiving(location)}>Archivar</Button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-2 rounded-panel border border-subtle bg-white p-4">
          <p className="t-ui font-semibold text-ink">Tu tienda lleva un solo stock por SKU.</p>
          <p className="t-body text-ink-2">Si tienes más de un local, agrega tus sedes. La primera recibe todas las unidades que tienes hoy, así que nada cambia hasta que agregues la segunda y muevas unidades a ella.</p>
        </div>
      )}
      {writable ? (
        editing === "new" ? (
          <section className="grid gap-3 rounded-panel border border-subtle bg-white p-4" aria-label="Nueva sede">
            <h3 className="t-ui font-semibold text-ink">{locations.length ? "Nueva sede" : "Tu primera sede"}</h3>
            {locations.length ? null : <p className="t-meta">Suele ser el local donde está hoy tu stock.</p>}
            <LocationForm location={null} onDone={done} onCancel={() => setEditing(null)} />
          </section>
        ) : locations.length < LOCATION_LIMIT ? (
          <Button variant={locations.length ? "secondary" : "primary"} icon={<Plus aria-hidden />} className="w-fit" onClick={() => setEditing("new")}>
            {locations.length ? "Agregar sede" : "Agregar mi primera sede"}
          </Button>
        ) : (
          <p className="t-meta">Llegaste a {LOCATION_LIMIT} sedes, el máximo por tienda.</p>
        )
      ) : null}
      {archiving ? (
        <ArchiveSheet location={archiving} others={locations.filter((location) => location.id !== archiving.id)} onClose={() => setArchiving(null)} onDone={done} />
      ) : null}
    </div>
  );
}
