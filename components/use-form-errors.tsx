"use client";

import { useRef, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/ui/error-summary";

type FieldError = { name: string; id: string; label: string; message: string };
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function fieldLabel(control: Control) {
  return control.dataset.errorLabel
    || control.closest("fieldset")?.querySelector(":scope > legend")?.textContent?.trim()
    || control.labels?.[0]?.textContent?.trim()
    || control.name;
}

function nativeError(control: Control) {
  const value = control.type === "password" ? control.value : control.value.trim();
  if (control.validity.valueMissing || (control.required && !value)) return "Completa este dato.";
  if (control.validity.typeMismatch) return control.type === "email" ? "Ingresa un correo válido." : "Revisa el formato de este dato.";
  const minLength = "minLength" in control ? control.minLength : -1;
  if (value && minLength > 0 && value.length < minLength) return "Usa al menos " + minLength + " caracteres.";
  if (control.validity.patternMismatch || control.validity.badInput) return "Revisa el formato de este dato.";
  if (control.validity.rangeUnderflow || control.validity.rangeOverflow || control.validity.tooLong) return "Revisa el valor de este dato.";
  return "";
}

function collectErrors(form: HTMLFormElement, prefix: string, custom: Record<string, string>) {
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  for (const element of Array.from(form.elements ?? [])) {
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)) continue;
    const control = element as Control;
    if (!control.name || control.matches(":disabled") || seen.has(control.name)) continue;
    seen.add(control.name);
    const message = custom[control.name] || nativeError(control);
    if (message) errors.push({ name: control.name, id: control.id, label: fieldLabel(control), message });
  }
  for (const [name, message] of Object.entries(custom)) {
    if (message && !seen.has(name)) errors.push({ name, id: prefix + "-" + name, label: "", message });
  }
  return errors;
}

// Shared presentation only: each workflow keeps its checks and server authority.
// Like useConfirm, this hook returns the controller and the UI it owns.
export function useFormErrors(prefix: string, action = "continuar") {
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  const errorFor = (name: string) => errors.find((error) => error.name === name)?.message;

  function validate(form: HTMLFormElement, custom: Record<string, string> = {}) {
    formRef.current = form;
    const found = collectErrors(form, prefix, custom);
    setErrors(found);
    if (found.length) setAttempt((value) => value + 1);
    return found.length === 0;
  }

  function setFieldError(name: string, message: string) {
    if (!formRef.current) return;
    const found = collectErrors(formRef.current, prefix, { [name]: message });
    setErrors(found);
    setAttempt((value) => value + 1);
  }

  function clear(name?: string) {
    setErrors((current) => name ? current.filter((error) => error.name !== name) : []);
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.name) clear(target.name);
  }

  const summary = (
    <ErrorSummary
      id={prefix + "-errores"}
      title={"Revisa " + errors.length + (errors.length === 1 ? " dato" : " datos") + " para " + action}
      errors={errors.map(({ id, label, message }) => ({ id, message: label ? label + ": " + message : message }))}
      attempt={attempt}
    />
  );
  return [{ formRef, errorFor, validate, setFieldError, clear, onChange }, summary] as const;
}
