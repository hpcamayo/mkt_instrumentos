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

// Supabase's sign-up answers with the account an address already has instead of making a new one: a confirmed account
// comes back without identities, and one still waiting for its confirmation comes back as it was first registered
// (Supabase sends its confirmation again and keeps its data, account type included). Codex's fourth review of #55: when
// the check above couldn't answer, an unconfirmed account of the other type must not read as the account asked for.
export function signUpFoundExistingAccount(
  user: { identities?: unknown[] | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
  accountType: string,
) {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.length === 0) return true;
  return !!user.user_metadata && user.user_metadata.account_type !== accountType;
}
