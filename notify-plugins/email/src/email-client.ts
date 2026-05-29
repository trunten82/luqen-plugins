import { createTransport, type Transporter } from 'nodemailer';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string;
  readonly password: string;
}

export interface EmailAttachment {
  readonly filename: string;
  readonly content: string;
  readonly contentType?: string;
  readonly cid?: string;
}

export interface EmailMessage {
  readonly from: string;
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  readonly attachments?: ReadonlyArray<EmailAttachment>;
}

export class EmailClient {
  private readonly transport: Transporter;

  constructor(config: SmtpConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: message.from,
      to: Array.isArray(message.to) ? (message.to as string[]).join(', ') : (message.to as string),
      subject: message.subject,
      html: message.html,
      ...(message.text !== undefined ? { text: message.text } : {}),
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType !== undefined ? { contentType: a.contentType } : {}),
        ...(a.cid !== undefined ? { cid: a.cid } : {}),
      })),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transport.verify();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.transport.close();
  }
}
