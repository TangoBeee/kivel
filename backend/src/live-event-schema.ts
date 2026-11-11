export const liveEventSchema = `
    CREATE TABLE live_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        topic text NOT NULL,
        scope_id uuid NOT NULL,
        workspace_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
        event text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX live_events_scope ON live_events (topic, scope_id, id);
    CREATE INDEX live_events_age ON live_events (created_at);

    CREATE TABLE live_stream_leases (
        id uuid PRIMARY KEY,
        caller text NOT NULL,
        workspace_id uuid,
        expires_at timestamptz NOT NULL
    );
    CREATE INDEX live_stream_leases_caller ON live_stream_leases (caller, expires_at);
    CREATE INDEX live_stream_leases_workspace ON live_stream_leases (workspace_id, expires_at);

    CREATE FUNCTION record_live_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
        event_topic text;
        event_scope uuid;
        workspace uuid;
        event_name text;
        event_id bigint;
        current_status text;
    BEGIN
        CASE TG_TABLE_NAME
            WHEN 'captured_requests' THEN
                event_topic := 'webhook';
                event_scope := NEW.inbox_id;
                SELECT owner_id INTO workspace FROM inboxes WHERE id = event_scope;
                event_name := 'webhook.request.created';
            WHEN 'email_messages' THEN
                event_topic := 'email';
                event_scope := NEW.resource_id;
                SELECT owner_id INTO workspace FROM temporary_resources WHERE id = event_scope;
                IF TG_OP = 'INSERT' AND NEW.message->>'direction' IS DISTINCT FROM 'outbound' THEN
                    event_name := 'email.message.received';
                ELSIF TG_OP = 'UPDATE' THEN
                    current_status := NEW.message->>'deliveryStatus';
                    IF current_status IS DISTINCT FROM OLD.message->>'deliveryStatus'
                        AND current_status IN ('sent', 'delivered', 'bounced') THEN
                        event_name := 'email.message.' || current_status;
                    END IF;
                END IF;
            WHEN 'approvals' THEN
                event_topic := 'approvals';
                workspace := NEW.account_id;
                event_scope := workspace;
                IF TG_OP = 'INSERT' THEN
                    event_name := 'approval.created';
                ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'answered' THEN
                    event_name := 'approval.answered';
                END IF;
            WHEN 'monitors' THEN
                event_topic := 'monitors';
                workspace := NEW.account_id;
                event_scope := workspace;
                IF NEW.monitor->>'status' IS DISTINCT FROM OLD.monitor->>'status' THEN
                    event_name := 'monitor.status.changed';
                END IF;
            WHEN 'mock_calls' THEN
                event_topic := 'mock';
                event_scope := NEW.resource_id;
                SELECT owner_id INTO workspace FROM temporary_resources WHERE id = event_scope;
                event_name := 'mock.call.created';
            WHEN 'temporary_resources' THEN
                IF NEW.kind = 'mock' AND NEW.owner_id IS NOT NULL
                   AND NEW.payload::jsonb ? 'payment'
                   AND (NEW.payload::jsonb #> '{paymentState,transactions}' IS DISTINCT FROM OLD.payload::jsonb #> '{paymentState,transactions}'
                    OR NEW.payload::jsonb #> '{paymentState,attempts}' IS DISTINCT FROM OLD.payload::jsonb #> '{paymentState,attempts}') THEN
                    event_topic := 'payments';
                    workspace := NEW.owner_id;
                    event_scope := workspace;
                    event_name := 'payment.created';
                END IF;
        END CASE;
        IF event_name IS NOT NULL THEN
            -- Reserve sequence numbers in commit order within a topic.
            PERFORM pg_advisory_xact_lock(hashtextextended(event_topic || ':' || event_scope::text, 19501));
            INSERT INTO live_events (topic, scope_id, workspace_id, event)
            VALUES (event_topic, event_scope, workspace, event_name)
            RETURNING id INTO event_id;
            PERFORM pg_notify('kivel_events', json_build_object(
                'topic', event_topic, 'scopeId', event_scope, 'id', event_id::text
            )::text);
        END IF;
        RETURN NEW;
    END $$;

    CREATE TRIGGER live_webhook AFTER INSERT ON captured_requests FOR EACH ROW EXECUTE FUNCTION record_live_event();
    CREATE TRIGGER live_email AFTER INSERT OR UPDATE OF message ON email_messages FOR EACH ROW EXECUTE FUNCTION record_live_event();
    CREATE TRIGGER live_approval AFTER INSERT OR UPDATE OF status ON approvals FOR EACH ROW EXECUTE FUNCTION record_live_event();
    CREATE TRIGGER live_monitor AFTER UPDATE OF monitor ON monitors FOR EACH ROW EXECUTE FUNCTION record_live_event();
    CREATE TRIGGER live_mock AFTER INSERT ON mock_calls FOR EACH ROW EXECUTE FUNCTION record_live_event();
    CREATE TRIGGER live_payment AFTER UPDATE OF payload ON temporary_resources FOR EACH ROW EXECUTE FUNCTION record_live_event();
`;
