"use client";

import { useId } from "react";
import { citySuggestions, peruRegions } from "@/lib/location";

type LocationFieldsProps = {
  cityName?: string;
  regionName?: string;
  defaultCity?: string;
  defaultRegion?: string;
  required?: boolean;
};

export function LocationFields({
  cityName = "city",
  regionName = "region",
  defaultCity = "",
  defaultRegion = "",
  required = true,
}: LocationFieldsProps) {
  const id = useId();
  const cityListId = `${id}-cities`;
  const regionListId = `${id}-regions`;

  return (
    <>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Ciudad</span>
        <input
          name={cityName}
          required={required}
          autoComplete="address-level2"
          defaultValue={defaultCity}
          list={cityListId}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
          placeholder="Buscar ciudad o escribir manualmente"
        />
        <datalist id={cityListId}>
          {citySuggestions.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Región</span>
        <input
          name={regionName}
          required={required}
          autoComplete="address-level1"
          defaultValue={defaultRegion}
          list={regionListId}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
          placeholder="Buscar región"
        />
        <datalist id={regionListId}>
          {peruRegions.map((region) => (
            <option key={region} value={region} />
          ))}
        </datalist>
      </label>
    </>
  );
}
