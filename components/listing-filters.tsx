"use client";

import { useEffect, useState } from "react";
import {
  instrumentFilterGroups,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import {
  categoryOptions,
  cityOptions,
  conditionOptions,
  sellerTypeOptions,
  sortOptions,
  type ListingFilters,
} from "@/lib/listings";

type ListingFiltersProps = {
  filters: ListingFilters;
};

const instrumentTypeOptions = instrumentFilterGroups.map((group) => ({
  value: group.instrumentType,
  label: group.label,
}));

export function ListingFilters({ filters }: ListingFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedInstrumentType, setSelectedInstrumentType] = useState(
    filters.instrumentType ?? "",
  );

  useEffect(() => {
    setSelectedInstrumentType(filters.instrumentType ?? "");
  }, [filters.instrumentType]);

  const advancedGroup =
    instrumentFilterGroups.find(
      (group) => group.instrumentType === selectedInstrumentType,
    ) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setIsFilterOpen(true)}
          className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-ink shadow-sm"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={() => setIsSortOpen(true)}
          className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-ink shadow-sm"
        >
          Ordenar
        </button>
      </div>

      <aside className="hidden lg:sticky lg:top-5 lg:block">
        <FilterForm
          filters={filters}
          advancedGroup={advancedGroup}
          onInstrumentTypeChange={setSelectedInstrumentType}
        />
      </aside>

      {isFilterOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar filtros"
            onClick={() => setIsFilterOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Filtros</h2>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <FilterForm
              filters={filters}
              advancedGroup={advancedGroup}
              onInstrumentTypeChange={setSelectedInstrumentType}
              isFrameless
            />
          </div>
        </div>
      ) : null}

      {isSortOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar orden"
            onClick={() => setIsSortOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Ordenar</h2>
              <button
                type="button"
                onClick={() => setIsSortOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="grid gap-2">
              {sortOptions.map((option) => (
                <a
                  key={option.value}
                  href={buildListingsHref(filters, { sort: option.value })}
                  className={
                    option.value === filters.sort
                      ? "rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                      : "rounded-md border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  }
                >
                  {option.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterForm({
  filters,
  advancedGroup,
  onInstrumentTypeChange,
  isFrameless = false,
}: {
  filters: ListingFilters;
  advancedGroup: (typeof instrumentFilterGroups)[number] | null;
  onInstrumentTypeChange: (value: string) => void;
  isFrameless?: boolean;
}) {
  return (
    <form
      action="/listados"
      className={
        isFrameless
          ? ""
          : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <div
        className={
          isFrameless ? "hidden" : "flex items-center justify-between gap-3"
        }
      >
        <h2 className="text-base font-semibold text-ink">Filtros</h2>
        <a
          href="/listados"
          className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline"
        >
          Limpiar filtros
        </a>
      </div>

      {isFrameless ? (
        <a
          href="/listados"
          className="mb-4 inline-flex text-sm font-semibold text-slate-600 underline-offset-4 hover:underline"
        >
          Limpiar filtros
        </a>
      ) : null}

      <div className={isFrameless ? "grid gap-4" : "mt-4 grid gap-4"}>
        <SelectField
          label="Categoría"
          name="category"
          defaultValue={filters.category}
          options={categoryOptions}
        />
        <SelectField
          label="Instrumento"
          name="instrument_type"
          defaultValue={filters.instrumentType}
          options={instrumentTypeOptions}
          onChange={onInstrumentTypeChange}
        />
        <SelectField
          label="Condición"
          name="condition"
          defaultValue={filters.condition}
          options={conditionOptions.map((condition) => ({
            value: condition,
            label: condition,
          }))}
        />
        <TextField
          label="Marca"
          name="brand"
          defaultValue={filters.brand}
          placeholder="Fender, Yamaha..."
        />
        <SelectField
          label="Ubicación"
          name="location"
          defaultValue={filters.city}
          options={cityOptions.map((city) => ({ value: city, label: city }))}
        />
        <SelectField
          label="Vendedor"
          name="seller_type"
          defaultValue={filters.sellerType}
          options={sellerTypeOptions}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Desde"
            name="min_price"
            defaultValue={filters.minPrice}
          />
          <NumberField
            label="Hasta"
            name="max_price"
            defaultValue={filters.maxPrice}
          />
        </div>
        <SelectField
          label="Ordenar"
          name="sort"
          defaultValue={filters.sort}
          options={sortOptions}
          includeAllOption={false}
        />
      </div>

      {advancedGroup ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-ink">
            Detalles de {advancedGroup.label.toLowerCase()}
          </h3>
          <div className="mt-4 grid gap-4">
            {advancedGroup.filters.map((filter) => (
              <AdvancedFilterField
                key={filter.key}
                filter={filter}
                value={filters.advanced[filter.key]}
              />
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="submit"
        className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Aplicar filtros
      </button>
    </form>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  includeAllOption?: boolean;
  onChange?: (value: string) => void;
  options: readonly {
    value: string;
    label: string;
  }[];
};

function SelectField({
  label,
  name,
  defaultValue,
  includeAllOption = true,
  onChange,
  options,
}: SelectFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      >
        {includeAllOption ? <option value="">Todos</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildListingsHref(
  filters: ListingFilters,
  overrides: Partial<{
    sort: string;
  }> = {},
) {
  const params = new URLSearchParams();

  appendParam(params, "category", filters.category);
  appendParam(params, "location", filters.city);
  appendParam(params, "condition", filters.condition);
  appendParam(params, "brand", filters.brand);
  appendParam(params, "seller_type", filters.sellerType);
  appendParam(params, "instrument_type", filters.instrumentType);
  appendParam(params, "min_price", filters.minPrice);
  appendParam(params, "max_price", filters.maxPrice);
  appendParam(params, "sort", overrides.sort ?? filters.sort);

  for (const [key, value] of Object.entries(filters.advanced)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `/listados?${query}` : "/listados";
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === "") {
    return;
  }

  params.set(key, String(value));
}

type TextFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
};

function TextField({ label, name, defaultValue, placeholder }: TextFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

type NumberFieldProps = {
  label: string;
  name: string;
  defaultValue?: number;
};

function NumberField({ label, name, defaultValue }: NumberFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        min="0"
        name={name}
        defaultValue={defaultValue}
        placeholder="S/."
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

function AdvancedFilterField({
  filter,
  value,
}: {
  filter: InstrumentFilterConfig;
  value?: string | string[] | number | boolean;
}) {
  if (filter.type === "multiselect") {
    const values = new Set(
      Array.isArray(value) ? value.map(String) : value ? [String(value)] : [],
    );

    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-slate-700">
          {filter.label}
        </legend>
        <div className="grid gap-2">
          {(filter.options ?? []).map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                name={filter.key}
                value={option.value}
                defaultChecked={values.has(option.value)}
                className="h-4 w-4 rounded border-slate-300 text-brass focus:ring-brass"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (filter.type === "number") {
    return (
      <NumberField
        label={filter.label}
        name={filter.key}
        defaultValue={typeof value === "number" ? value : undefined}
      />
    );
  }

  return (
    <SelectField
      label={filter.label}
      name={filter.key}
      defaultValue={value === undefined ? undefined : String(value)}
      options={filter.options ?? []}
    />
  );
}
