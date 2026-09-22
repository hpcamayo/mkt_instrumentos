# Laria V1 go-live infrastructure checklist

This checklist records infrastructure work that must be complete before Laria opens the marketplace to real users. It does not change the frozen V1 product behavior in `docs/functional-spec.md`.

## Marketplace email worker — mandatory

PRE-GO-LIVE on Vercel Hobby deliberately has no automatic worker registration. Controlled QA invokes `GET /api/internal/email/process` with the server-only `CRON_SECRET`. Durable jobs, retries and daily matches remain in Postgres until a protected worker invocation claims them. There is no pre-launch Immediate-email latency SLA.

Before go-live:

1. Provision a supported automatic scheduler for the existing protected worker route.
2. Start with an approximately 5–15 minute cadence.
3. Verify the scheduler supplies `Authorization: Bearer ${CRON_SECRET}` and exposes no secret to browser code or logs.
4. Run an empty protected scheduler smoke.
5. Verify a new Immediate alert is delivered automatically without manual invocation.
6. Verify retryable provider failure is picked up automatically without a duplicate logical send.
7. Verify completed `America/Lima` daily windows are prepared and sent once, with no empty digest.
8. Review Resend sending limits, bounce/complaint handling and current deliverability signals.
9. Update architecture/operations documentation to remove the pre-go-live manual-worker limitation.

Sprint 9 final launch acceptance must not close while this section remains incomplete.
