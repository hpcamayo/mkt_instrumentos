// The sign-up forms ask whether an address already has an account, so they can say so before Supabase's sign-up.
// Launch audit A28: past the visitor's limit the answer is "limited", and when the check can't answer (it refuses to
// while its counter is down, so it can't be used to sweep addresses) it is "unknown". The form then goes on: Supabase's
// own sign-up still finds an address that has an account.
export type EmailCheck = "available" | "exists" | "limited" | "unknown";

export async function checkEmailAvailability(email: string): Promise<EmailCheck> {
  try {
    const response = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (response.status === 429) return "limited";
    const result = (await response.json().catch(() => null)) as { ok?: unknown; available?: unknown } | null;
    if (!response.ok || result?.ok !== true || typeof result.available !== "boolean") return "unknown";
    return result.available ? "available" : "exists";
  } catch {
    return "unknown";
  }
}
