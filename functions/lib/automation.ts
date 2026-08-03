export async function queueEventUpdateNotifications(
  db: D1Database,
  eventId: string,
  changedFields: string[],
  now: string,
): Promise<void> {
  const event = await db
    .prepare("SELECT status, invite_automation_enabled FROM events WHERE id = ?1")
    .bind(eventId)
    .first<{ status: string; invite_automation_enabled: number }>();
  if (!event || !event.invite_automation_enabled || !["open", "active"].includes(event.status)) return;

  const players = await db
    .prepare(
      `SELECT ep.id
       FROM event_players ep
       WHERE ep.event_id = ?1 AND ep.invitation_status = 'invited'`,
    )
    .bind(eventId)
    .all<{ id: string }>();
  if (!players.results.length) return;

  const notificationKey = JSON.stringify({ id: crypto.randomUUID(), changedFields });
  await db.batch(
    players.results.map((player) =>
      db
        .prepare(
          `INSERT INTO event_update_notifications
           (id, event_id, event_player_id, notification_key, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?5)`,
        )
        .bind(crypto.randomUUID(), eventId, player.id, notificationKey, now),
    ),
  );
}

export function notificationFields(notificationKey: string): string[] {
  try {
    const parsed = JSON.parse(notificationKey) as { changedFields?: unknown };
    return Array.isArray(parsed.changedFields)
      ? parsed.changedFields.filter((field): field is string => typeof field === "string")
      : [];
  } catch {
    return [];
  }
}
