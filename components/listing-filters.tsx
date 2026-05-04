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
  const advancedGroup =
    instrumentFilterGroups.find(
      (group) => group.instrumentType === filters.instrumentType,
    ) ?? null;

  return (
    <aside className="lg:sticky lg:top-5">
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
            Limpiar filtros
          </a>
        </div>

        <div className="mt-4 grid gap-4">
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
    </aside>
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
