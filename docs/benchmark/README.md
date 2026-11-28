# BIST Forecast Benchmark — Data Contract

## Scope

- Companies: THYAO, TUPRS, FROTO, BIMAS, MGROS, TCELL, ASELS, SISE, EREGL, TOASO.
- Training window: 2024 Q1–2025 Q4 (8 standalone quarterly observations).
- Blind evaluation window: 2026 Q1, Q2, Q3 (3 forecast horizons).
- Forecasts must be captured and time-stamped before any 2026 actual is imported.

## Data rights and permitted source

Do not automate downloads from KAP's public website or persist KAP material unless the required MKK/Borsa İstanbul permission or distribution agreement is in place. KAP's copyright notice says information and documents are for information purposes and restricts copying, storing for future use, distribution, or modification without prior written MKK permission.

Preferred route: obtain access through the official MKK API Portal / KAP data-distribution service. The official integration guidance describes a Borsa İstanbul data-distribution agreement, MKK authorization for the relevant IPs, and API credentials. A licensed market-data provider with explicit rights for this use is an alternative.

Until authorized source access is documented, do not ingest, cache, or commit company financial statement values. This repository contains no benchmark company dataset.

Official references:
- KAP copyright and disclaimer: https://www.kap.org.tr/tr/icerik/Diger/telif-hakki-ve-cekince-ihbari
- MKK KAP data publication service / API integration guidance: https://www.kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873
- MKK API Portal announcement: https://www.mkk.com.tr/haberler/mkk-api-portal-yayinda

## Financial series rules

1. Use consolidated statements consistently where available. Record consolidation status per company and period.
2. Record the reporting currency and unit for every company. Never combine company amounts across currencies; forecast each company independently.
3. Flow metrics (revenue, cost of sales, gross profit, operating profit, net profit, operating cash flow) are reported cumulatively for Q1, H1, 9M and FY in many filings. Convert cumulative values to standalone quarters:
   - Q1 = Q1 cumulative
   - Q2 = H1 cumulative − Q1 cumulative
   - Q3 = 9M cumulative − H1 cumulative
   - Q4 = FY cumulative − 9M cumulative
4. For Turkish inflation-adjusted statements, first express all cumulative observations on one common purchasing-power basis using the official CPI index at each reporting date; only then calculate quarter differences. Record the index source, index value, base date and transformation formula. Do not subtract figures expressed at different reporting-date price levels.
5. Do not mix flow metrics with point-in-time balance-sheet stocks. Stocks (cash, assets, debt) require a separate quarter-end series and must not be differenced.
6. Keep source filing ID, publication date, report period, source currency, unit, consolidation flag, restatement basis and transformation lineage with every observation.

## Canonical import CSV

One row per company, metric and standalone quarter:

`ticker,company,metric,period,value,currency,unit,source,filing_id,published_at,consolidated,price_basis,cpi_index,cpi_base_date,transformation_version`

- `period`: ISO quarter, e.g. `2025-Q4`.
- `value`: numeric standalone-quarter value, already converted to the declared common price basis.
- `source`: licensed provider or authorized MKK/KAP distribution channel.
- `price_basis`: explicit, e.g. `2025-12-31 purchasing power`.
- `transformation_version`: versioned calculation recipe; never silently overwrite prior runs.

## Blind-test protocol

1. Validate 8 complete, unique, ordered historical observations per ticker/metric.
2. Load only 2024 Q1–2025 Q4 into the benchmark organization.
3. Call ABYS forecast API and capture the complete Q1–Q3 2026 output, model selection, input observation IDs, timestamp and response hash.
4. Freeze the forecast artifact before importing any 2026 actuals.
5. Import 2026 actuals only after the forecast artifact is sealed.
6. Calculate errors by company, metric and horizon. Report MAE and RMSE; use WAPE where MAPE is undefined or unstable for zero/negative values. Do not average unlike currencies or metrics into one misleading score.
7. Publish failures, missing data, skipped companies and all exclusions alongside the headline results.

## Current status

- KPI API now preserves the optional `period` field on write and read.
- Forecasting and KPI outcome tests pass.
- No real-company benchmark has been run or claimed.
- Data acquisition is blocked pending authorized MKK/KAP distribution access or a licensed provider.
