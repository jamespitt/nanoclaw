/**
 * ZapMeow Channel for NanoClaw
 *
 * Receives inbound messages via webhook from ZapMeow (POST /webhook on port 8001)
 * and sends outbound messages via ZapMeow's REST API.
 *
 * ZapMeow manages the WhatsApp connection independently; NanoClaw just talks to it.
 *
 * Webhook payload from ZapMeow:
 *   { instanceId: "1", message: { sender, chat, body, from_me, message_id, timestamp, ... } }
 *
 * Send API:
 *   POST http://localhost:8900/{instanceId}/chat/send/text
 *   { phone: "447906616842", text: "hello" }
 */
import http from 'http';

import {
  ASSISTANT_HAS_OWN_NUMBER,
  ASSISTANT_NAME,
  ZAPMEOW_BASE_URL,
  ZAPMEOW_INSTANCE_ID,
  ZAPMEOW_WEBHOOK_PORT,
} from '../config.js';
import { logger } from '../logger.js';
import { Channel, OnChatMetadata, OnInboundMessage, RegisteredGroup } from '../types.js';

export interface ZapMeowChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

interface ZapMeowWebhookBody {
  instanceId: string;
  message: {
    id: number;
    sender: string;       // bare phone number, no @server
    chat: string;         // bare phone number or group ID, no @server
    message_id: string;
    from_me: boolean;
    timestamp: string;
    body: string;
    media_type: string;
  };
}

/**
 * Reconstruct a full WhatsApp JID from ZapMeow's bare number.
 * WhatsApp group IDs are >15 digits; phone numbers are ≤15.
 */
function toJid(bare: string): string {
  if (bare.includes('@')) return bare;
  return bare.length > 15 ? `${bare}@g.us` : `${bare}@s.whatsapp.net`;
}

export class ZapMeowChannel implements Channel {
  name = 'whatsapp';
  private server!: http.Server;
  private connected = false;
  private opts: ZapMeowChannelOpts;

  constructor(opts: ZapMeowChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/webhook') {
          res.writeHead(404);
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200);
          res.end();
          try {
            const payload: ZapMeowWebhookBody = JSON.parse(body);
            this.handleWebhook(payload).catch((err) =>
              logger.error({ err }, 'ZapMeow webhook handler error'),
            );
          } catch (err) {
            logger.warn({ err, body: body.slice(0, 200) }, 'Failed to parse ZapMeow webhook body');
          }
        });
      });

      this.server.listen(ZAPMEOW_WEBHOOK_PORT, () => {
        this.connected = true;
        logger.info({ port: ZAPMEOW_WEBHOOK_PORT }, 'ZapMeow webhook listener started');
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  private async handleWebhook(payload: ZapMeowWebhookBody): Promise<void> {
    const msg = payload?.message;
    if (!msg?.chat) return;

    const chatJid = toJid(msg.chat);
    const senderJid = msg.sender ? toJid(msg.sender) : chatJid;
    const timestamp = msg.timestamp || new Date().toISOString();
    const isGroup = chatJid.endsWith('@g.us');

    this.opts.onChatMetadata(chatJid, timestamp, undefined, 'whatsapp', isGroup);

    const groups = this.opts.registeredGroups();
    if (!groups[chatJid]) return;

    const content = msg.body || '';
    const isBotMessage = ASSISTANT_HAS_OWN_NUMBER
      ? msg.from_me
      : content.startsWith(`${ASSISTANT_NAME}:`);

    this.opts.onMessage(chatJid, {
      id: msg.message_id || String(msg.id),
      chat_jid: chatJid,
      sender: senderJid,
      sender_name: msg.sender || senderJid.split('@')[0],
      content,
      timestamp,
      is_from_me: msg.from_me,
      is_bot_message: isBotMessage,
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const prefixed = ASSISTANT_HAS_OWN_NUMBER
      ? text
      : `${ASSISTANT_NAME}: ${text}`;

    const phone = jid.split('@')[0];
    const url = `${ZAPMEOW_BASE_URL}/${ZAPMEOW_INSTANCE_ID}/chat/send/text`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text: prefixed }),
      });
      if (!res.ok) {
        const responseBody = await res.text();
        logger.warn({ jid, status: res.status, responseBody }, 'ZapMeow send failed');
      } else {
        logger.info({ jid, length: prefixed.length }, 'Message sent via ZapMeow');
      }
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send message via ZapMeow');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // ZapMeow doesn't expose a typing indicator API
  }

  async syncGroupMetadata(_force = false): Promise<void> {
    // ZapMeow manages the WhatsApp connection; no group sync needed from NanoClaw
  }
}
