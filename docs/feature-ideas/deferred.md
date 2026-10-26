# Feature ideas: deferred for later

This is the single list of approved or possible ideas that the current build does not include, with the reason for each. Full descriptions, sources and costs are in `ideas.json`, and Henri's marks and notes are in `verdicts.json`. The marking page is https://claude.ai/artifact/7iWMJuxxKLaxsdibsWEZQd.

Last updated: 2026-10-26, when the build started.

## Approved, marked "later" by Henri (13)

| Idea | What it is | Henri's note | What it waits for |
| --- | --- | --- | --- |
| run-01 Staff accounts | Store staff with roles (Vendedor, Encargado, Dueño); every stock movement records who made it | "later" | His call. Permissions touch every store screen and database function. |
| money-01 Protected payment | Buyer pays through a processor that holds the money until receipt, minus a fee | "later" | Processor contract (Mercado Pago split payments, Culqi, Niubiz, Izipay), terms rewrite, disputes desk, SUNAT invoices for Laria's fee. Pilot A must also be live first. |
| money-02 Shipping booked in Laria | Courier booking, labels and tracking from the listing | "later" | Courier contracts (Olva, Shalom, a Lima same-day courier), insurance. Works best with money-01. |
| disc-06 Short videos on listings | Optional 15-30 s vertical video, played only when tapped | "later" | Video storage and delivery cost, video moderation. |
| disc-07 Pedalboard planner | Drag pedals onto a real-size board; fit, total price, power | "later" | Pedal dimensions and power specs in the catalog (Jev sprint). |
| bet-01 Curated auctions | Weekly Admin-curated auction for rare gear | "later" (and his earlier save-08 note about future auctions) | money-01, auction rules under consumer law, checks against fake bids. |
| bet-03 Rentals and rent-to-own | Stores rent instruments and backline; rent-to-own for students | "later" | Deposits, damage and contracts; much easier after money-01. Rentals are prohibited today. |
| bet-05 Donate an instrument | Donations to vetted youth programs, with drop-off at partner stores | "later" | Partnerships (for example Sinfonía por el Perú, school bands). |
| bet-06 Store clinics and events | Events on store pages and a city calendar, in followers' weekly digest | "later" | His call. |
| bet-07 Live demos, linked | A store's scheduled Instagram or TikTok live, linked to listings | "later" | His call. |
| bet-08 Quotes for institutions | Schools, churches and bands ask several stores for a quote at once | "later" | His call. Wanted ads are prohibited today. |
| earn-01 Store plans (Laria Pro) | Paid monthly plan with a higher allowance and more tools | "later. no charging in the pilot yet." | The end of the no-charging pilot, a payment processor, SUNAT invoices, terms. |
| earn-02 Featured, clearly labelled | Paid 7-day placement, labelled "Destacado", capped | "later. no charging yet." | Same as earn-01. |

## Maybe (7)

| Idea | What it is | Henri's note | What it waits for |
| --- | --- | --- | --- |
| safe-01 Identity check for sellers | DNI check through a provider (Didit, US$0.20 per check), "Identidad verificada" mark | "next wave. im thinking of charging perticular sellers a fee when the item is over 500 or 1000 soles. not defined yet." | His fee decision for Particulares (threshold S/ 500 or S/ 1,000), the provider contract, consent and privacy-policy update. |
| safe-04 A technician's check | A partner luthier's signed report shown on the listing | "def Yes but later. i have to look for partners first." | Henri finding partner luthiers, repair shops or stores. |
| buy-03 Ask Laria | Plain-language search answered with live listings | none | The Jev sprint (AI engine) and the catalog. |
| buy-04 Search with a photo | Photo → likely brand and model → listings and typical price | none | The Jev sprint and catalog matching; related to big-07 (also a Maybe). |
| buy-10 Alerts on WhatsApp | Alerts and confirmations by WhatsApp, daily digest by default | "later." | Meta message costs (about US$0.03 per utility message to Peru) and template approval. |
| reach-03 A website for your store | A store's own domain pointing at a clean storefront | none | Custom domains through the hosting provider; fits a paid store plan (earn-01). |
| bet-04 Publish by sending a WhatsApp | Photos and a voice note to Laria's number become a draft listing | none | big-07 (still a Maybe), the Jev sprint, WhatsApp Business costs. |

## Approved, waiting for the catalog (built when typical prices exist)

The catalog autofill must reach main first. It must never be copied from `proto/catalog-autofill-jev-bvvvxm`.

| Idea | Waits for |
| --- | --- |
| reach-07 Your price against the market | Typical prices (big-13). |
| disc-01 Price guide pages | Catalog matching and enough data per model. |
| disc-08 Fits your gear | Fit attributes in the catalog. |
| sell-01 Mi equipo, the estimated value only | Typical prices. Mi equipo itself is built now. |
| safe-05 Red flags, the price rule only | Typical prices. The photo-copy rule is built now. |

## Approved, built in wave 2 of this program

| Idea | Why it waits |
| --- | --- |
| buy-09 Installments | Henri's note: "next wave". It ships as store-floor's second PR. |
| run-02 Several locations, run-03 Boleta from the counter | They change stock, so they start after store-floor's wave-1 PR is merged. |

## Left out of the listing-details batch

Parts of approved ideas that the batch (`listing-details.md`) does not build, and what each waits for.

| Idea | Part left out | What it waits for |
| --- | --- | --- |
| buy-08 Ver en mapa | Finding the store's pin from its typed address | A geocoding service (an outside account and its terms); stores place the pin by hand today. |
| buy-08 Ver en mapa | More than the 300 newest results on the map, and map pins for Particulares | Server-side clustering if the catalog outgrows it; Particulares stay city areas by design (FD-listing-details-13). |
| buy-08 Ver en mapa | Places outside the short district and city list | A fuller gazetteer (INEI's district centroids) in `lib/places.ts`. |
| buy-01 Combos | Combos for listings in the assisted-purchase pilot | Pilot A's own review, so a listing never shows two ways to buy. |
| buy-01 Combos | A server copy of the buyer's combo (to continue on another device) | His call; it would need an account and a new table. |
| sell-10 Condition scale | Admin's editor offering open box only on store listings | A small Admin change; the database already refuses it on a Particular listing. |
| buy-02 Cómo se entrega | Shipping booked or priced by Laria | money-02 (above). |

## Still open from Effortless Laria (not part of this list)

- **Maybes:** big-02, big-07, stock-24, talk-06, talk-07.
- **Waiting for autofill:** big-13, find-17, post-12.
- **Turned down:** big-05.
