
CREATE OR REPLACE FUNCTION chat_message_counts(channel_ids uuid[])
RETURNS TABLE(channel_id uuid, cnt bigint) AS $$
  SELECT cm.channel_id, count(*) AS cnt
  FROM chat_messages cm
  WHERE cm.channel_id = ANY(channel_ids)
  GROUP BY cm.channel_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;

