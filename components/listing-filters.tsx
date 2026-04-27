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

export function ListingFilters({ filters }: ListingFiltersProps) {
  return (
    <form
      action="/listados"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Filtros</h2>
        <a
          href="/listados"
          className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline"
        >
          Limpiar
        </a>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Categoría"
          name="category"
          defaultValue={filters.category}
          options={categoryOptions}
        />
        <SelectField
          label="Ciudad"
          name="city"
          defaultValue={filters.city}
          options={cityOptions.map((city) => ({ value: city, label: city }))}
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
        <SelectField
          label="Vendedor"
          name="seller_type"
          defaultValue={filters.sellerType}
          options={sellerTypeOptions}
        />
        <NumberField
          label="Precio mínimo"
          name="min_price"
          defaultValue={filters.minPrice}
        />
        <NumberField
          label="Precio máximo"
          name="max_price"
          defaultValue={filters.maxPrice}
        />
        <SelectField
          label="Ordenar"
          name="sort"
          defaultValue={filters.sort}
          options={sortOptions}
          includeAllOption={false}
        />
      </div>

      <button
        type="submit"
        className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 sm:w-auto"
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
  options,
}: SelectFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
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
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}
