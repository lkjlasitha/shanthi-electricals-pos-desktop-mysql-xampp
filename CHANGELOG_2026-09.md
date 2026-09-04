# Update notes — September 2026

## 1. Letterhead on quotations & invoices
Quotations, sales invoices, and other A4 documents now print with your
business logo, name, and tagline recreated at the top, matching your
official letterhead. This is drawn by the software (not left blank), so it
works on plain paper.

- Business logo: Settings → Branding → upload a PNG/JPG (defaults to the
  logo already extracted from your letterhead).
- Tagline: Settings → "Tagline" field — one line per line, shown under the
  business name.

## 2. Redesigned POS receipt (80mm thermal printer)
The receipt now includes your logo and tagline, with cleaner spacing and
alignment. No settings change needed — it uses the same logo/tagline as #1.

## 3. Wire/cable sold by length (per-meter pricing with unit conversion)
- New units: Meter, Foot, Yard, Inch (all convertible to each other).
  Added automatically — no setup needed.
- To use it: create/edit a wire or cable product with its Stock Unit and
  Sale Unit both set to **Meter**, and set the selling **price per meter**.
- In the POS cart and in Quotations, that product now shows a "Length +
  unit" field instead of a plain quantity box. The cashier can type "5" and
  pick "ft" (or yd/in/m) — the system automatically converts to the correct
  meter-equivalent for pricing AND for reducing stock, so stock and profit
  stay accurate no matter what unit the customer asked for.
- The invoice/receipt shows exactly what was sold (e.g. "5 ft") alongside
  the per-meter price, so customers see a clear, understandable bill.

**Known limitation:** the "Hold cart" quick-pause feature (separate from
saved Quotations) does not remember the chosen unit — resuming a held cart
with a wire line will show it as a plain meter quantity. Everything else
(checkout, Quotations, both receipt formats) is unit-aware.

## 4. Bug fix: financial totals were being saved incorrectly (important)
We found and fixed a bug that predates this update: due to a coding
mistake, fields like Discount, Shipping, and Tax Amount on sales/purchases
were being saved to the same database column, so any of those numbers you
saw again later (e.g. reprinting an old invoice, or in a report) could be
wrong, even though the total charged at checkout was correct at the time.
This is now fixed — each field is stored and reloaded independently and
correctly. If you have concerns about historical reports, let us know and
we can help review affected records.
