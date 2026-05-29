-- Support conversations
CREATE TABLE IF NOT EXISTS support_conversations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject          text        NOT NULL,
  status           text        NOT NULL DEFAULT 'open',
  priority         text        NOT NULL DEFAULT 'normal',
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz NULL,
  CONSTRAINT support_conversations_status_chk
    CHECK (status IN ('open','waiting_admin','waiting_user','closed')),
  CONSTRAINT support_conversations_priority_chk
    CHECK (priority IN ('low','normal','high','urgent'))
);

-- Support messages
CREATE TABLE IF NOT EXISTS support_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role      text        NOT NULL,
  message          text        NOT NULL,
  attachment_url   text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz NULL,
  CONSTRAINT support_messages_sender_role_chk
    CHECK (sender_role IN ('user','admin'))
);

CREATE INDEX IF NOT EXISTS idx_support_conv_user     ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_status   ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_conv_last_msg ON support_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_msg_conv      ON support_messages(conversation_id, created_at ASC);

-- RLS
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages      ENABLE ROW LEVEL SECURITY;

-- Users: full access to their own conversations
CREATE POLICY "support_conv_own"
  ON support_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users: read messages from their own conversations
CREATE POLICY "support_msg_read_own"
  ON support_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );

-- Users: insert messages into their own conversations
CREATE POLICY "support_msg_insert_own"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'user'
    AND conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );
