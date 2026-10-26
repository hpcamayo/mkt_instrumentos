import { categoryLandingRoute } from "../_category/landing";

// A category landing reads ?page, so it renders on every request (app/instrumentos/_category/landing.tsx).
export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

const route = categoryLandingRoute("amplificadores");
export const generateMetadata = route.generateMetadata;
export default route.Page;
