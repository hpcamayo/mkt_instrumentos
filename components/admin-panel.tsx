"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { categoryOptions, cityOptions, conditionOptions } from "@/lib/listings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type AuthState = "checking" | "signed_out" | "not_admin" | "admin";
type ListingStatus = "pending" | "approved" | "rejected" | "hidden" | "sold";
type StoreStatus = "pending" | "active" | "hidden";

type AdminListing = {
  id: string;
  title: string;
  status: ListingStatus;
  category: string;
  brand: string | null;
  model: string | null;
  condition: string | null;
  price_pen: number | null;
  city: string;
  description: string | null;
  contact_name: string | null;
  whatsapp_phone: string;
  created_at: string;
};

type AdminStore = {
  id: string;
  name: string;
  status: StoreStatus;
  city: string;
  district: string | null;
  address: string | null;
  whatsapp_phone: string;
  instagram_url: string | null;
  facebook_url: string | null;
  description: string | null;
  is_verified: boolean;
  created_at: string;
};

const listingActions: {
  label: string;
  status: ListingStatus;
}[] = [
  { label: "Aprobar", status: "approved" },
  { label: "Rechazar", status: "rejected" },
  { label: "Ocultar", status: "hidden" },
  { label: "Marcar vendido", status: "sold" },
];

const storeActions: {
  label: string;
  status: StoreStatus;
}[] = [
  { label: "Aprobar", status: "active" },
  { label: "Ocultar", status: "hidden" },
];

export function AdminPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        setAuthState("signed_out");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setAuthState("signed_out");
        return;
      }

      await checkAdminAccess();
    }

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function checkAdminAccess() {
    if (!supabase) {
      setAuthState("signed_out");
      return;
    }

    const { data, error } = await supabase.rpc("is_admin");
    if (error || data !== true) {
      setAuthState("not_admin");
      setIsBusy(false);
      return;
    }

    setAuthState("admin");
    await loadAdminQueues();
    setIsBusy(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Falta configurar Supabase en `.env.local`.");
      return;
    }

    setIsBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("No pudimos iniciar sesión. Revisa el correo y la contraseña.");
      setIsBusy(false);
      return;
    }

    await checkAdminAccess();
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setAuthState("signed_out");
    setListings([]);
    setStores([]);
  }

  async function loadAdminQueues() {
    if (!supabase) {
      return;
    }

    const [{ data: listingRows, error: listingsError }, { data: storeRows, error: storesError }] =
      await Promise.all([
        supabase
          .from("listings")
          .select(
            "id,title,status,category,brand,model,condition,price_pen,city,description,contact_name,whatsapp_phone,created_at",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("stores")
          .select(
            "id,name,status,city,district,address,whatsapp_phone,instagram_url,facebook_url,description,is_verified,created_at",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
      ]);

    if (listingsError || storesError) {
      setMessage("No pudimos cargar las solicitudes pendientes.");
      return;
    }

    setListings((listingRows ?? []) as AdminListing[]);
    setStores((storeRows ?? []) as AdminStore[]);
  }

  async function updateListingStatus(id: string, status: ListingStatus) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    setIsBusy(false);

    if (error) {
      setMessage("No pudimos actualizar el estado del listado.");
      return;
    }

    setMessage("Estado del listado actualizado.");
    await loadAdminQueues();
  }

  async function saveListing(listing: AdminListing) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase
      .from("listings")
      .update({
        title: listing.title,
        category: listing.category,
        brand: listing.brand,
        model: listing.model,
        condition: listing.condition,
        price_pen: listing.price_pen,
        city: listing.city,
        region: listing.city === "Huancayo" ? "Junin" : listing.city,
        description: listing.description,
        contact_name: listing.contact_name,
        whatsapp_phone: listing.whatsapp_phone,
      })
      .eq("id", listing.id);
    setIsBusy(false);

    setMessage(
      error
        ? "No pudimos guardar los cambios del listado."
        : "Cambios del listado guardados.",
    );
  }

  async function updateStoreStatus(id: string, status: StoreStatus) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase.from("stores").update({ status }).eq("id", id);
    setIsBusy(false);

    if (error) {
      setMessage("No pudimos actualizar el estado de la tienda.");
      return;
    }

    setMessage("Estado de la tienda actualizado.");
    await loadAdminQueues();
  }

  async function saveStore(store: AdminStore) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase
      .from("stores")
      .update({
        name: store.name,
        city: store.city,
        region: store.city === "Huancayo" ? "Junin" : store.city,
        district: store.district,
        address: store.address,
        whatsapp_phone: store.whatsapp_phone,
        instagram_url: store.instagram_url,
        facebook_url: store.facebook_url,
        description: store.description,
        is_verified: store.is_verified,
      })
      .eq("id", store.id);
    setIsBusy(false);

    setMessage(
      error ? "No pudimos guardar los cambios de la tienda." : "Cambios de la tienda guardados.",
    );
  }

  function updateListing(id: string, changes: Partial<AdminListing>) {
    setListings((current) =>
      current.map((listing) =>
        listing.id === id ? { ...listing, ...changes } : listing,
      ),
    );
  }

  function updateStore(id: string, changes: Partial<AdminStore>) {
    setStores((current) =>
      current.map((store) => (store.id === id ? { ...store, ...changes } : store)),
    );
  }

  if (!supabase) {
    return <SetupMessage />;
  }

  if (authState === "checking") {
    return <PanelShell title="Panel administrativo">Revisando acceso...</PanelShell>;
  }

  if (authState === "signed_out") {
    return (
      <PanelShell title="Panel administrativo">
        <form onSubmit={handleLogin} className="grid max-w-md gap-4">
          <TextField label="Correo" value={email} onChange={setEmail} />
          <PasswordField label="Contraseña" value={password} onChange={setPassword} />
          {message ? <StatusMessage message={message} /> : null}
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-400"
          >
            {isBusy ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </PanelShell>
    );
  }

  if (authState === "not_admin") {
    return (
      <PanelShell title="Acceso restringido">
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-slate-600">
            Tu usuario inició sesión, pero no tiene permisos de administrador.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Cerrar sesión
          </button>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Panel administrativo" onSignOut={handleSignOut}>
      <div className="grid gap-8">
        {message ? <StatusMessage message={message} /> : null}
        <section className="grid gap-4">
          <SectionHeading
            title="Listados pendientes"
            count={listings.length}
            onRefresh={loadAdminQueues}
          />
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Listado</th>
                  <th className="px-3 py-3">Datos</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">Descripción</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {listings.map((listing) => (
                  <tr key={listing.id} className="align-top">
                    <td className="space-y-3 px-3 py-4">
                      <Input
                        value={listing.title}
                        onChange={(value) => updateListing(listing.id, { title: value })}
                      />
                      <Select
                        value={listing.category}
                        options={categoryOptions}
                        onChange={(value) => updateListing(listing.id, { category: value })}
                      />
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <Input
                        value={listing.brand ?? ""}
                        placeholder="Marca"
                        onChange={(value) => updateListing(listing.id, { brand: value })}
                      />
                      <Input
                        value={listing.model ?? ""}
                        placeholder="Modelo"
                        onChange={(value) => updateListing(listing.id, { model: value })}
                      />
                      <Select
                        value={listing.condition ?? ""}
                        options={conditionOptions.map((condition) => ({
                          value: condition,
                          label: condition,
                        }))}
                        onChange={(value) => updateListing(listing.id, { condition: value })}
                      />
                      <Input
                        value={String(listing.price_pen ?? "")}
                        placeholder="Precio"
                        type="number"
                        onChange={(value) =>
                          updateListing(listing.id, {
                            price_pen: value ? Number(value) : null,
                          })
                        }
                      />
                      <Select
                        value={listing.city}
                        options={cityOptions.map((city) => ({ value: city, label: city }))}
                        onChange={(value) => updateListing(listing.id, { city: value })}
                      />
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <Input
                        value={listing.contact_name ?? ""}
                        placeholder="Nombre"
                        onChange={(value) =>
                          updateListing(listing.id, { contact_name: value })
                        }
                      />
                      <Input
                        value={listing.whatsapp_phone}
                        placeholder="WhatsApp"
                        onChange={(value) =>
                          updateListing(listing.id, {
                            whatsapp_phone: normalizePhone(value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-4">
                      <Textarea
                        value={listing.description ?? ""}
                        onChange={(value) =>
                          updateListing(listing.id, { description: value })
                        }
                      />
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => saveListing(listing)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold"
                      >
                        Guardar
                      </button>
                      <div className="grid gap-2">
                        {listingActions.map((action) => (
                          <button
                            type="button"
                            key={action.status}
                            disabled={isBusy}
                            onClick={() => updateListingStatus(listing.id, action.status)}
                            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-400"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {listings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No hay listados pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4">
          <SectionHeading
            title="Tiendas pendientes"
            count={stores.length}
            onRefresh={loadAdminQueues}
          />
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Tienda</th>
                  <th className="px-3 py-3">Ubicación</th>
                  <th className="px-3 py-3">Contacto</th>
                  <th className="px-3 py-3">Descripción</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stores.map((store) => (
                  <tr key={store.id} className="align-top">
                    <td className="space-y-3 px-3 py-4">
                      <Input
                        value={store.name}
                        onChange={(value) => updateStore(store.id, { name: value })}
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={store.is_verified}
                          onChange={(event) =>
                            updateStore(store.id, {
                              is_verified: event.target.checked,
                            })
                          }
                        />
                        Tienda verificada
                      </label>
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <Select
                        value={store.city}
                        options={cityOptions.map((city) => ({ value: city, label: city }))}
                        onChange={(value) => updateStore(store.id, { city: value })}
                      />
                      <Input
                        value={store.district ?? ""}
                        placeholder="Distrito"
                        onChange={(value) => updateStore(store.id, { district: value })}
                      />
                      <Input
                        value={store.address ?? ""}
                        placeholder="Dirección"
                        onChange={(value) => updateStore(store.id, { address: value })}
                      />
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <Input
                        value={store.whatsapp_phone}
                        placeholder="WhatsApp"
                        onChange={(value) =>
                          updateStore(store.id, { whatsapp_phone: normalizePhone(value) })
                        }
                      />
                      <Input
                        value={store.instagram_url ?? ""}
                        placeholder="Instagram"
                        onChange={(value) =>
                          updateStore(store.id, { instagram_url: value || null })
                        }
                      />
                      <Input
                        value={store.facebook_url ?? ""}
                        placeholder="Facebook"
                        onChange={(value) =>
                          updateStore(store.id, { facebook_url: value || null })
                        }
                      />
                    </td>
                    <td className="px-3 py-4">
                      <Textarea
                        value={store.description ?? ""}
                        onChange={(value) => updateStore(store.id, { description: value })}
                      />
                    </td>
                    <td className="space-y-3 px-3 py-4">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => saveStore(store)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold"
                      >
                        Guardar
                      </button>
                      <div className="grid gap-2">
                        {storeActions.map((action) => (
                          <button
                            type="button"
                            key={action.status}
                            disabled={isBusy}
                            onClick={() => updateStoreStatus(store.id, action.status)}
                            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-400"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {stores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No hay tiendas pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

function PanelShell({
  title,
  children,
  onSignOut,
}: {
  title: string;
  children: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        </div>
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Cerrar sesión
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SetupMessage() {
  return (
    <PanelShell title="Panel administrativo">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Falta configurar Supabase. Agrega `NEXT_PUBLIC_SUPABASE_URL` y
        `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`.
      </div>
    </PanelShell>
  );
}

function SectionHeading({
  title,
  count,
  onRefresh,
}: {
  title: string;
  count: number;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="text-sm text-slate-500">
          {count} solicitud{count === 1 ? "" : "es"}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="w-fit rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold"
      >
        Actualizar
      </button>
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      {message}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      min={type === "number" ? 0 : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none focus:border-brass focus:ring-2 focus:ring-amber-100"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly {
    value: string;
    label: string;
  }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none focus:border-brass focus:ring-2 focus:ring-amber-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Textarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value}
      rows={8}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brass focus:ring-2 focus:ring-amber-100"
    />
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
