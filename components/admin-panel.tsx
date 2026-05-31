"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LocationFields } from "@/components/location-fields";
import { normalizePeruRegion } from "@/lib/location";
import { categoryOptions, cityOptions, conditionOptions } from "@/lib/listings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Database } from "@/lib/supabase/database.types";

type AuthState = "checking" | "signed_out" | "not_admin" | "admin";
type ListingStatus = Database["public"]["Enums"]["listing_status"];
type StoreStatus = Database["public"]["Enums"]["store_status"];
type InviteAccountType = "seller" | "store_owner";

type InviteResponse = {
  ok: boolean;
  message: string;
  invite?: {
    email: string;
    accountType: InviteAccountType;
    finalInvitePath: string;
    fullName: string;
    phone: string;
    city: string;
    region: string;
    storeName: string;
    notes: string;
  };
};

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
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteResult, setInviteResult] = useState<InviteResponse["invite"] | null>(
    null,
  );
  const [inviteAccountType, setInviteAccountType] =
    useState<InviteAccountType>("seller");
  const [isInviting, setIsInviting] = useState(false);
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

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const rawRegion = readFormText(formData, "region");
    const normalizedRegion = rawRegion ? normalizePeruRegion(rawRegion) : null;

    if (rawRegion && !normalizedRegion) {
      setInviteMessage("Selecciona una region valida de Peru.");
      return;
    }

    setIsInviting(true);
    setInviteMessage("");
    setInviteResult(null);

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: readFormText(formData, "email"),
        fullName: readFormText(formData, "fullName"),
        phone: readFormText(formData, "phone"),
        accountType: inviteAccountType,
        city: readFormText(formData, "city"),
        region: normalizedRegion ?? "",
        storeName: readFormText(formData, "storeName"),
        notes: readFormText(formData, "notes"),
      }),
    });
    const result = (await response.json().catch(() => ({
      ok: false,
      message: "No se pudo procesar la respuesta del servidor.",
    }))) as InviteResponse;

    setIsInviting(false);
    setInviteMessage(result.message);

    if (response.ok && result.ok) {
      setInviteResult(result.invite ?? null);
      form.reset();
      setInviteAccountType("seller");
    }
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
            className="rounded-md bg-laria-ink px-4 py-3 text-sm font-black text-white transition hover:bg-laria-blue disabled:bg-laria-steel"
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
            className="w-fit rounded-md border border-laria-steel bg-white px-4 py-2 text-sm font-black text-laria-ink transition hover:border-laria-blue hover:text-laria-blue"
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
        <section
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Resumen administrativo"
        >
          <AdminStatCard label="Listados pendientes" value={listings.length} />
          <AdminStatCard label="Tiendas pendientes" value={stores.length} />
          {/* UI placeholder only; replace with real moderation metrics when implemented. */}
          <AdminStatCard label="Acciones de hoy" value="--" />
          {/* UI placeholder only; replace with real invite metrics when implemented. */}
          <AdminStatCard label="Invitaciones" value="--" />
        </section>
        <InviteUserSection
          accountType={inviteAccountType}
          inviteMessage={inviteMessage}
          inviteResult={inviteResult}
          isInviting={isInviting}
          onAccountTypeChange={setInviteAccountType}
          onSubmit={handleInviteSubmit}
        />
        <section className="grid gap-4">
          <SectionHeading
            title="Listados pendientes"
            count={listings.length}
            onRefresh={loadAdminQueues}
          />
          <div className="overflow-x-auto rounded-lg border border-laria-fog bg-white shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
            <table className="min-w-[1100px] text-left text-sm">
              <thead className="bg-laria-cloud text-xs font-black uppercase tracking-wide text-laria-text-soft">
                <tr>
                  <th className="px-3 py-3">Listado</th>
                  <th className="px-3 py-3">Datos</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">Descripción</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-laria-fog">
                {listings.map((listing) => (
                  <tr key={listing.id} className="align-top transition hover:bg-[#f8fbff]">
                    <td className="space-y-3 px-3 py-4">
                      <StatusBadge label="Pendiente" tone="blue" />
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
                        className="w-full rounded-md border border-laria-steel px-3 py-2 text-xs font-black text-laria-ink transition hover:border-laria-blue hover:text-laria-blue disabled:opacity-50"
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
                            className="rounded-md bg-laria-ink px-3 py-2 text-xs font-black text-white transition hover:bg-laria-blue disabled:bg-laria-steel"
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
                    <td colSpan={5} className="px-3 py-10 text-center font-medium text-laria-text-soft">
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
          <div className="overflow-x-auto rounded-lg border border-laria-fog bg-white shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
            <table className="min-w-[1000px] text-left text-sm">
              <thead className="bg-laria-cloud text-xs font-black uppercase tracking-wide text-laria-text-soft">
                <tr>
                  <th className="px-3 py-3">Tienda</th>
                  <th className="px-3 py-3">Ubicación</th>
                  <th className="px-3 py-3">Contacto</th>
                  <th className="px-3 py-3">Descripción</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-laria-fog">
                {stores.map((store) => (
                  <tr key={store.id} className="align-top transition hover:bg-[#f8fbff]">
                    <td className="space-y-3 px-3 py-4">
                      <StatusBadge label="Pendiente" tone="blue" />
                      <Input
                        value={store.name}
                        onChange={(value) => updateStore(store.id, { name: value })}
                      />
                      <label className="flex items-center gap-2 text-xs font-bold text-laria-text-soft">
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
                        className="w-full rounded-md border border-laria-steel px-3 py-2 text-xs font-black text-laria-ink transition hover:border-laria-blue hover:text-laria-blue disabled:opacity-50"
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
                            className="rounded-md bg-laria-ink px-3 py-2 text-xs font-black text-white transition hover:bg-laria-blue disabled:bg-laria-steel"
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
                    <td colSpan={5} className="px-3 py-10 text-center font-medium text-laria-text-soft">
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

function InviteUserSection({
  accountType,
  inviteMessage,
  inviteResult,
  isInviting,
  onAccountTypeChange,
  onSubmit,
}: {
  accountType: InviteAccountType;
  inviteMessage: string;
  inviteResult: InviteResponse["invite"] | null;
  isInviting: boolean;
  onAccountTypeChange: (value: InviteAccountType) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">
          Acceso
        </p>
        <h2 className="mt-1 text-xl font-black text-laria-ink">
          Invitar usuario
        </h2>
        <p className="mt-2 text-sm leading-6 text-laria-text-soft">
          Envía un enlace de activación para vendedores particulares o dueños de
          tienda. No se crean contraseñas temporales.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
        <AdminFormInput
          label="Correo"
          name="email"
          type="email"
          required
          placeholder="persona@email.com"
        />
        <AdminFormInput
          label="Nombre completo"
          name="fullName"
          required
          placeholder="Nombre de contacto"
        />
        <AdminFormInput
          label="WhatsApp"
          name="phone"
          required
          placeholder="+51 999 999 999"
        />
        <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
          Tipo de cuenta
          <select
            value={accountType}
            onChange={(event) =>
              onAccountTypeChange(event.target.value as InviteAccountType)
            }
            className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
          >
            <option value="seller">Vendedor particular</option>
            <option value="store_owner">Dueño de tienda</option>
          </select>
        </label>
        <LocationFields required={false} />
        {accountType === "store_owner" ? (
          <AdminFormInput
            label="Nombre de tienda"
            name="storeName"
            placeholder="Nombre comercial"
          />
        ) : null}
        <label className="grid gap-2 text-sm font-bold text-laria-text-soft lg:col-span-2">
          Notas internas
          <textarea
            name="notes"
            rows={3}
            placeholder="Contexto de campo, origen del contacto o seguimiento pendiente"
            className="rounded-md border border-laria-steel bg-white px-3 py-2 text-sm font-semibold text-laria-ink outline-none transition placeholder:text-laria-muted focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="grid gap-3 lg:col-span-2">
          {inviteMessage ? <StatusMessage message={inviteMessage} /> : null}
          {inviteResult ? (
            <div className="rounded-md border border-blue-100 bg-[#eef5ff] p-4 text-sm font-medium leading-6 text-laria-text-soft">
              <p className="font-black text-laria-blue">
                Seguimiento de invitación
              </p>
              <p>{inviteResult.fullName} - {inviteResult.email}</p>
              <p>
                Tipo:{" "}
                {inviteResult.accountType === "seller"
                  ? "Vendedor particular"
                  : "Dueño de tienda"}
              </p>
              <p>Destino: {inviteResult.finalInvitePath}</p>
              {inviteResult.storeName ? <p>Tienda: {inviteResult.storeName}</p> : null}
              {inviteResult.notes ? <p>Notas: {inviteResult.notes}</p> : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={isInviting}
            className="w-fit rounded-md bg-laria-ink px-4 py-3 text-sm font-black text-white transition hover:bg-laria-blue disabled:bg-laria-steel"
          >
            {isInviting ? "Enviando..." : "Enviar invitación"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AdminFormInput({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: "email" | "text";
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
      {label}
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition placeholder:text-laria-muted focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
      />
    </label>
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
    <main className="bg-laria-cloud/70">
      <div className="mx-auto grid w-full max-w-[1600px] gap-5 px-3 py-6 sm:px-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-5 xl:px-6">
        <aside className="rounded-lg border border-white/10 bg-laria-black p-4 text-white shadow-[0_18px_48px_rgb(5_6_8/0.22)] lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-yellow">
            Laria Admin
          </p>
          <h1 className="mt-2 text-2xl font-black leading-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/68">
            Revisa solicitudes, modera publicaciones e invita nuevos vendedores.
          </p>

          <nav aria-label="Navegación administrativa" className="mt-5 grid gap-2">
            <AdminNavItem label="Cola de revisión" isActive />
            <AdminNavItem label="Invitaciones" />
            <AdminNavItem label="Tiendas" />
            <AdminNavItem label="Listados" />
          </nav>

          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="mt-5 min-h-10 w-full rounded-md border border-white/20 px-4 py-2 text-sm font-black text-white transition hover:border-laria-blue hover:text-laria-blue"
            >
              Cerrar sesión
            </button>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-5">
          <header className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_18px_48px_rgb(16_18_23/0.07)] sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
              Operaciones
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-laria-ink sm:text-4xl">
                  {title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-laria-text-soft">
                  Panel operativo para revisión manual. Las acciones conservan
                  el flujo actual de aprobación y rechazo.
                </p>
              </div>
              <StatusBadge label="Modo admin" tone="blue" />
            </div>
          </header>

          {children}
        </div>
      </div>
    </main>
  );
}

function SetupMessage() {
  return (
    <PanelShell title="Panel administrativo">
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-medium leading-6 text-laria-ink">
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
        <h2 className="text-xl font-black text-laria-ink">{title}</h2>
        <p className="text-sm font-medium text-laria-text-soft">
          {count} solicitud{count === 1 ? "" : "es"}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="w-fit rounded-md border border-laria-steel bg-white px-3 py-2 text-xs font-black text-laria-ink transition hover:border-laria-blue hover:text-laria-blue"
      >
        Actualizar
      </button>
    </div>
  );
}

function AdminNavItem({
  label,
  isActive = false,
}: {
  label: string;
  isActive?: boolean;
}) {
  return (
    <div
      className={
        isActive
          ? "rounded-md border border-blue-300/30 bg-laria-blue px-3 py-2 text-sm font-black text-white"
          : "rounded-md border border-transparent px-3 py-2 text-sm font-bold text-white/68"
      }
    >
      {label}
    </div>
  );
}

function AdminStatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
      <p className="text-xs font-black uppercase tracking-wide text-laria-text-soft">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-black text-laria-ink">{value}</p>
        <div
          className="flex h-9 w-14 items-end gap-1 rounded bg-[#eef5ff] px-2 py-1"
          aria-hidden="true"
        >
          <span className="h-3 w-2 rounded-t bg-laria-blue/45" />
          <span className="h-5 w-2 rounded-t bg-laria-blue/65" />
          <span className="h-7 w-2 rounded-t bg-laria-blue" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "neutral";
}) {
  return (
    <span
      className={
        tone === "blue"
          ? "inline-flex w-fit items-center rounded-full border border-blue-200 bg-[#eef5ff] px-2.5 py-1 text-xs font-black text-laria-blue"
          : "inline-flex w-fit items-center rounded-full border border-laria-fog bg-laria-cloud px-2.5 py-1 text-xs font-black text-laria-text-soft"
      }
    >
      {label}
    </span>
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-blue-100 bg-[#eef5ff] p-4 text-sm font-bold text-laria-text-soft shadow-sm">
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
    <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
      {label}
      <input
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
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
    <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
      {label}
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
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
      className="h-10 w-full rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition placeholder:text-laria-muted focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
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
      className="h-10 w-full rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
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
      className="w-full rounded-md border border-laria-steel bg-white px-3 py-2 text-sm font-semibold text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-blue-100"
    />
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
