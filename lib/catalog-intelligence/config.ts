// Runtime switches for the catalog prototype. Every default is the safe one: autofill and Jev are off, nothing is
// enforced, and no threshold is calibrated. Production has none of these variables set.

export type JevMode = "off" | "shadow" | "enforce";

// Minimums and maximums the policy compares Jev's answers with. They must come from a labeled Laria calibration
// set (spec §13, §19); `source` says where a set came from so a demo set can never enforce.
export type PolicyThresholds = {
  source: "calibrated" | "demo";
  label: string;
  choiceMin: number;
  sufficientMin: number;
  conflictMax: number;
  detailMin: number;
  suspiciousMax: number;
};

// Illustrative values to show which gates exist in the prototype. NOT calibrated: chosen by hand, never measured.
export const DEMO_THRESHOLDS: PolicyThresholds = {
  source: "demo",
  label: "Umbrales de demostración sin calibrar",
  choiceMin: 0.9,
  sufficientMin: 0.9,
  conflictMax: 0.1,
  detailMin: 2,
  suspiciousMax: 0.1,
};

export type JevConfig = {
  mode: JevMode;
  // Why the mode differs from what the environment asked for (for example, enforce is not approved yet).
  modeNote: string | null;
  provider: "mock" | "gateway";
  modelId: string;
  timeoutMs: number;
  maxAttempts: number;
  maxCandidates: number;
  thresholds: PolicyThresholds | null;
  // Seller kinds automatic approval may ever apply to (spec §14). Verified stores and Admin keep their rights.
  autoApproveFor: readonly ("particular" | "store")[];
};

type Env = Record<string, string | undefined>;

export function isAutofillPrototypeEnabled(env: Env = process.env) {
  return env.CATALOG_AUTOFILL_PROTOTYPE === "1";
}

export function readJevConfig(env: Env = process.env): JevConfig {
  const requested = env.JEV_MODE ?? "off";
  const killed = env.JEV_KILL_SWITCH === "1";
  let mode: JevMode = requested === "shadow" ? "shadow" : "off";
  let modeNote: string | null = null;
  if (requested === "enforce") {
    // Enforcement needs the owner's approval of the policy (spec §18, §23.6); until then it runs as shadow.
    mode = "shadow";
    modeNote = "enforce_not_approved";
  }
  if (killed) {
    mode = "off";
    modeNote = "kill_switch";
  }
  const timeout = Number.parseInt(env.JEV_TIMEOUT_MS ?? "", 10);
  return {
    mode,
    modeNote,
    provider: env.JEV_PROVIDER === "gateway" && (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN) ? "gateway" : "mock",
    modelId: env.JEV_MODEL_ID || "typesafe-ai/jev",
    timeoutMs: Number.isFinite(timeout) ? Math.min(15000, Math.max(500, timeout)) : 4000,
    maxAttempts: 2,
    maxCandidates: 5,
    thresholds: null,
    autoApproveFor: ["particular", "store"],
  };
}
