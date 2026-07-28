# Notification System Explanation

> **Current stack (PostgreSQL-only):** App realtime uses `notificationService.publish()` → **PostgreSQL `LISTEN`/`NOTIFY`**. Redis is used only for the **Socket.IO adapter** across pods — not for event pub/sub. Canonical multi-pod flow: [`REALTIME_UPDATE_FLOW-MULTI-TENANCY.md`](./REALTIME_UPDATE_FLOW-MULTI-TENANCY.md).

## Your Questions Answered

### Q1: "After modifying a user, do we just need to save to the database, without needing to publish?"

**Answer: NO** — We still need to explicitly publish notifications.

Just saving to the database does not automatically trigger WebSocket updates. Call `notificationService.publish()` so clients get a structured event.

**Why?**
- Database writes are separate from notification publishing
- The notification system needs to know *what* changed and *who* to notify
- WebSocket clients need structured event data, not just database changes

**However**, we *could* use database triggers to call `pg_notify()` on data changes and drop explicit publish calls. That is not how it is implemented today.

### Q2: "Should we still see 'publishing to Redis' in logs for app events?"

**Answer: NO** — App event publish goes through PostgreSQL NOTIFY.

Misleading "Redis" log lines for app events were cleaned up. Redis may still appear in logs related to the **Socket.IO adapter** connection, which is expected and separate from `notificationService.publish()`.

---

## How It Actually Works

### Current Implementation

1. **Save to Database** → Updates PostgreSQL
2. **Explicit Publish** → `notificationService.publish('member-updated', data)`
3. **Unified Service** → Always PostgreSQL NOTIFY
4. **PostgreSQL NOTIFY** → `pg_notify(…)`
5. **WebSocket Service Listens** → Receives notification via LISTEN
6. **Socket.IO Broadcast** → Sends to connected clients (Redis adapter across pods)
7. **Frontend Updates** → React state updates, UI refreshes

### Why We Need Explicit Publish

Even though we're using PostgreSQL, we still need to explicitly publish because:

1. **Structured Data**: We need to send specific event data (member ID, name, color, etc.), not just "something changed"
2. **Event Type**: We need to specify the event type (`member-updated`, `task-created`, etc.)
3. **Tenant Isolation**: We need to include tenant ID for multi-tenant isolation
4. **WebSocket Format**: The data needs to be formatted for WebSocket clients

### Alternative: Database Triggers (Future Enhancement)

We *could* eliminate explicit publish calls by using PostgreSQL triggers:

```sql
CREATE OR REPLACE FUNCTION notify_member_updated()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('member-updated', json_build_object(
    'memberId', NEW.id,
    'member', json_build_object(
      'id', NEW.id,
      'name', NEW.name,
      'color', NEW.color
    ),
    'timestamp', NOW()
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER member_updated_trigger
AFTER UPDATE ON members
FOR EACH ROW
EXECUTE FUNCTION notify_member_updated();
```

**Benefits:**
- No explicit publish calls needed
- Automatic notifications on any database change
- Guaranteed to fire (can't forget to publish)

**Drawbacks:**
- Less control over when notifications fire
- Harder to include application-level data
- More complex to maintain

---

## Summary

- ✅ **We still need explicit publish calls** — Just saving to DB isn't enough
- ✅ **App events use PostgreSQL NOTIFY** — via `notificationService.publish()`
- ✅ **Redis is still used** — Socket.IO adapter across pods, not app event pub/sub
- 💡 **Future enhancement** — Could use database triggers to eliminate explicit publish calls

