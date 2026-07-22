# Event state model

Allowed primary transitions:

```text
draft -> open
open -> active
open -> cancelled
active -> completed
active -> cancelled
completed -> active only through deliberate reopen
cancelled -> archived
completed -> archived
```

Invalid transitions must be rejected server-side.

Reopening a completed event requires:

- an authenticated organizer
- a reason
- an audit-log entry

Archiving changes normal visibility but does not remove historical records.
