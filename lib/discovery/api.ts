import { NextResponse } from "next/server";

// The discovery routes' answers (docs/feature-ideas/discovery.md). The database raises "CODE: mensaje" for every rule
// it checks (laria_private.raise_discovery_error); the message part is written for people and is shown as is.
const DISCOVERY_CODES = /^((?:STORE|MAKER|GIFT|LISTING|MADE_TO_ORDER|ARTIST|COLLECTION|REASON)_[A-Z_]+|ADMIN_REQUIRED): ([\s\S]+)$/;

export function discoveryErrorMessage(error: { message?: string } | null | undefined, fallback: string) {
  const match = DISCOVERY_CODES.exec(error?.message ?? "");
  return match ? match[2] : fallback;
}

export function discoveryFailure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function discoverySuccess(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function optionalText(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

export function optionalInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) && number >= min && number <= max ? number : undefined;
}
