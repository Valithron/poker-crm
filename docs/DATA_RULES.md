# Authoritative data rules

- Attendance exists only on `event_players.attended`.
- Invitation and RSVP states exist only on `event_players`.
- Player attendance totals are derived.
- Last-attended dates are derived.
- Money movement exists only as immutable ledger entries plus explicit corrections.
- Player net results are derived.
- Event balance is derived.
- Missing data uses `NULL`, never a monetary sentinel.
- Names may change without rewriting event relationships because relationships use IDs.
- Completed events are never silently modified.
