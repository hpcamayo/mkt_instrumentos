"use client";

import { useId } from "react";
import { citySuggestions, peruRegions } from "@/lib/location";
import { Field, Input } from "@/components/ui/field";

type LocationFieldsProps = {
  cityName?: string;
  regionName?: string;
  defaultCity?: string;
  defaultRegion?: string;
  required?: boolean;
  // Stable ids let a form's error summary link to these fields; errors are shown under each field.
  idPrefix?: string;
  cityError?: string;
  regionError?: string;
};

export function LocationFields({
  cityName = "city",
  regionName = "region",
  defaultCity = "",
  defaultRegion = "",
  required = true,
  idPrefix,
  cityError,
  regionError,
}: LocationFieldsProps) {
  const generatedId = useId();
  const id = idPrefix ?? generatedId;
  const cityListId = `${id}-cities`;
  const regionListId = `${id}-regions`;

  return (
    <>
      <Field id={`${id}-city`} label="Ciudad" error={cityError}>
        <Input
          name={cityName}
          required={required}
          autoComplete="address-level2"
          defaultValue={defaultCity}
          list={cityListId}
          placeholder="Buscar ciudad o escribir manualmente"
        />
      </Field>
      <datalist id={cityListId}>
        {citySuggestions.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

      <Field id={`${id}-region`} label="Región" error={regionError}>
        <Input
          name={regionName}
          required={required}
          autoComplete="address-level1"
          defaultValue={defaultRegion}
          list={regionListId}
          placeholder="Buscar región"
        />
      </Field>
      <datalist id={regionListId}>
        {peruRegions.map((region) => (
          <option key={region} value={region} />
        ))}
      </datalist>
    </>
  );
}
