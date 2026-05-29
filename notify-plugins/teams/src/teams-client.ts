export type TeamsCard = Readonly<Record<string, unknown>>;

export class TeamsClient {
  constructor(private readonly webhookUrl: string) {}

  async send(card: TeamsCard): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Teams webhook failed: HTTP ${response.status} - ${body}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = new URL(this.webhookUrl);
      return (
        url.hostname.includes('office.com') ||
        url.hostname.includes('webhook.office.com') ||
        url.hostname.includes('outlook.office.com')
      );
    } catch {
      return false;
    }
  }
}
