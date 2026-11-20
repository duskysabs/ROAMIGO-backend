# Notification Inbox API

All routes require a Supabase access token and an active application profile.
The backend uses the authenticated profile ID as the notification recipient;
clients cannot request or update another user's notifications. Existing booking,
review, payment, and dispatch workflows write notification rows. This API reads
those rows and tracks whether the recipient has read them. It does not deliver
push notifications, email, or webhooks.

| Route | Behavior |
| --- | --- |
| `GET /notifications?page=1&limit=20&type=BOOKING&status=unread` | Newest first, with `data` and `{ page, limit, total, totalPages }` metadata. `type` and `status` are optional. Valid statuses are `read` and `unread`; limit is 1–50. |
| `GET /notifications/unread-count` | Returns `{ "count": number }`. |
| `PATCH /notifications/:notificationId/read` | Returns the recipient's updated notification. A repeated call preserves the original `readAt`. Missing, expired, or foreign IDs return `404`. |
| `PATCH /notifications/read-all` | Returns `{ "updatedCount": number }`. Updates only the caller's unread notifications created before the operation began. |

Expired notifications (`expiresAt <=` the request time) are excluded from lists,
counts, and mark-read actions. A null expiry means the notification remains
visible. Marking all as read does not touch notifications created afterward.
Neither mark-read action deletes records. The response retains the existing
notification fields, including `actionUrl`, `createdAt`, and `readAt`.

The first inbox release requires no Prisma migration. Delivery channels,
preferences, reminders, and retention rules remain separate work.
