-- Additive: immutable quotes, receipts and existing payment records are untouched.
ALTER TABLE quotes ADD COLUMN tracking_code TEXT NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN completed_at INTEGER;

CREATE TABLE order_mail (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT
);
CREATE INDEX idx_order_mail_pending ON order_mail(status,next_attempt);
CREATE TABLE order_access_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);

-- Events and notification snapshots commit together, including under concurrent writes.
CREATE TRIGGER payment_order_event AFTER INSERT ON quote_payments
BEGIN
  INSERT INTO quote_events(quote_id,event,details,user_id)
  VALUES(NEW.quote_id,'payment',json_object('paymentId',NEW.id,'amountCents',NEW.amount_cents),NEW.user_id);
END;
CREATE TRIGGER order_event_mail AFTER INSERT ON quote_events
WHEN NEW.event IN ('order','payment')
BEGIN
  INSERT INTO order_mail(id,quote_id,payload)
  SELECT 'event-' || NEW.id,q.id,json_object(
    'kind',NEW.event,'at',NEW.created_at,'details',json(NEW.details),
    'status',CASE WHEN q.completed_at IS NOT NULL THEN 'completed' ELSE q.order_status END,
    'trackingCode',q.tracking_code,
    'paidCents',COALESCE((SELECT SUM(amount_cents) FROM quote_payments WHERE quote_id=q.id),0))
  FROM quotes q WHERE q.id=NEW.quote_id;
END;
