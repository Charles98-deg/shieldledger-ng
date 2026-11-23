# Trap report (seeded demo pack)

- **Recall over traps:** 10/10 = 100%
- **False positives over controls:** 0/7

On the seeded pack (12 invoices, 2 PO-pattern traps/controls, 1 vendor-pattern trap/control). This is a regression check on fictional seeded data, not a measure of general accuracy.

| Item | Kind | Scenario | Expected | Got | Result |
|---|---|---|---|---|---|
| D01 | trap | Short delivery | D01: SHORT_DELIVERY_HOLD | D01: SHORT_DELIVERY_HOLD | PASS |
| D03 | trap | Duplicate of D01 | D03: DUPLICATE_SUSPECTED | D03: DUPLICATE_SUSPECTED | PASS |
| D04 | trap | Footing failure | D04: FOOTING_FAILURE | D04: FOOTING_FAILURE | PASS |
| D05 | trap | Missing TIN | D05: MISSING_TIN_DOUBLE_WHT | D05: MISSING_TIN_DOUBLE_WHT | PASS |
| D06 | trap | TIN not in registry | D06: UNREGISTERED_VENDOR_BLOCKED | D06: UNREGISTERED_VENDOR_BLOCKED | PASS |
| D07 | trap | VAT omitted on standard supply | D07: VAT_OMITTED_SELF_ACCOUNT_ADVISORY | D07: VAT_OMITTED_SELF_ACCOUNT_ADVISORY | PASS |
| D08 | trap | Small vendor charges VAT | D08: INVALID_VAT_CHARGE_HOLD | D08: INVALID_VAT_CHARGE_HOLD | PASS |
| D12 | trap | Price variance | D12: PRICE_VARIANCE_HOLD | D12: PRICE_VARIANCE_HOLD | PASS |
| S1 | trap | Split PO (Ikang Civil Works) | PO-9001: SPLIT_PO_SUSPECTED; PO-9002: SPLIT_PO_SUSPECTED | PO-9001: SPLIT_PO_SUSPECTED; PO-9002: SPLIT_PO_SUSPECTED | PASS |
| G1 | trap | Ghost vendor (Anwana Support Services) | V-ANWANA: GHOST_VENDOR_SUSPECTED | V-ANWANA: GHOST_VENDOR_SUSPECTED | PASS |
| D02 | control | Price within tolerance | no flags | no flags | PASS |
| D09 | control | Professional services, clean | no flags | no flags | PASS |
| D10 | control | Capex generator, clean | no flags | no flags | PASS |
| D11 | control | AGO VAT-exempt within fuel tolerance | no flags | no flags | PASS |
| S0a | control | Single near-limit PO (Mkpani Hardware) | no flags | no flags | PASS |
| S0b | control | Two near-limit POs 12 days apart (Itu Quarry) | no flags | no flags | PASS |
| G0 | control | Vendor NUBAN with no payroll match (Akpabuyo Cleaning) | no flags | no flags | PASS |
