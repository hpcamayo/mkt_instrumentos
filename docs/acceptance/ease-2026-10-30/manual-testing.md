# Owner manual checks — remaining EASE cases

These ten cases remain **Not Run**. Browser and database checks cover the portions listed in results.json; they do not establish native OS behavior, spoken announcements or legal approval. Record the device/OS/browser version, role, outcome and a screenshot or short recording for each completed case. Keep existing IDs.

Use disposable Particular/buyer and approved store accounts. Do imports and complaint submissions on the isolated local app or a suitable test environment. Android install, gallery sharing and push need HTTPS at laria.audio. Remove any disposable accounts/data afterward.

| Test ID | Device / role | What to do | Acceptance evidence still needed |
| --- | --- | --- | --- |
| EASE-164 | Android or iPhone / visitor | Open a listing, tap **Compartir** once and choose WhatsApp. | Native share sheet opens in one tap with the listing title, “<título> a <precio> en Laria” and its link; verify the WhatsApp compose payload. Sending a message is unnecessary. |
| EASE-166 | Android Chrome / visitor | Tap **Compartir imagen**, choose WhatsApp → **Mi estado**. | The actual phone receives the 1080×1920 story PNG with text and link. Verify the Status preview; posting it is unnecessary. |
| EASE-512 | Phone rear camera / store | In a two-row import, continue from **Revisa los cambios** to **Fotos** → **Empezar sesión de fotos**. Take two photos of the first SKU, then **Siguiente SKU** and photograph the next. | Rear camera opens; each shot stays with the SKU on screen and in order, without file renaming. The automated run supplied files and verified assignment to the correct import row. Do not publish the import. |
| EASE-546 | Desktop Chrome and Safari / visitor | File a synthetic complaint locally. Press **Imprimir o guardar como PDF** and inspect each browser’s native preview, then save a PDF. | Only the filed sheet appears: no site header/footer, legal navigation or buttons. Page says **Guarda o imprime esta hoja** and makes no email-copy promise. Headless checks verified print invocation and print CSS, not the OS dialogs. |
| EASE-549 | Owner + legal reviewer | Review the complaints-book requirements and lib/complaints-book.ts. Supply approved business identity and sign-off. | Confirm razón social, RUC, domicilio, answer term, platform applicability, email-copy handling, retention and icon/notice. Replace the bracketed provider placeholders. This remains a production gate; no legal approval was inferred. |
| EASE-703 | VoiceOver or TalkBack / visitor | Enable the screen reader, throttle navigation above one second, open a listing from the catalog. | Hear **Cargando la página…** once, politely; announcement clears on arrival. The real DOM status was checked. |
| EASE-712 | VoiceOver or TalkBack / buyer + Particular | Save a favorite, add photos to the sell form, and change a catalog filter. | Hear saved state, changing upload summary and result totals without focus moving away. The live regions and favorite focus were checked structurally. |
| EASE-714 | Physical Android Chrome / visitor | Install Laria from Chrome’s menu, launch its icon, then long-press it. | Standalone window without the browser bar, correct Laria icon, and working **Vender un instrumento** / **Mis favoritos** shortcuts. Manifest and icon responses were verified. |
| EASE-716 | Installed Android app / Particular, store owner, signed out | From the gallery share two distinctly ordered photos to Laria. Repeat for all three account states; for signed out, complete sign-in. Also exercise the maximum of ten photos. | Correct role’s listing form opens at photos; photo order survives, including through sign-in. The deployed manifest/share landing page passed; native gallery intents remain untested. |
| EASE-719 | Supported physical phone / signed in | First browse without enabling notices. In **Notificaciones**, press **Activar avisos**, allow permission, and confirm the sample notice. Repeat/check on another device. | Permission is requested only by the switch, sample push is received, and activation is independent per device. Automated checks confirmed no unsolicited permission request; they did not grant OS permission or send a real push. |

Before checking EASE-712 near catalog bottom bars, account for the focus overlap defect tracked under EASE-710. Keep a failed accessibility observation open even if the spoken announcements work.

Update only each completed case’s status and concise evidence in acceptance/cases.tsv, then run:

    python3 -B acceptance/validate.py
    python3 -B -m unittest discover -s acceptance -p 'test_*.py'

Do not generate the acceptance workbook during active development.
