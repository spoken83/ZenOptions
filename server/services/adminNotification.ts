import axios from 'axios';

class AdminNotificationService {
  private botToken: string | undefined;
  private chatId: string | undefined;

  constructor() {
    this.botToken = process.env.ZENADMIN_BOT_TOKEN;
    this.chatId = process.env.ZENADMIN_CHAT_ID;
  }

  private async sendMessage(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      console.log('⚠️  ZenAdmin bot not configured (missing ZENADMIN_BOT_TOKEN or ZENADMIN_CHAT_ID)');
      return;
    }

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });
      console.log('✅ Admin notification sent successfully');
    } catch (error: any) {
      console.error('❌ Failed to send admin notification:', error.message);
    }
  }

  async notifyNewUserSignup(user: { id: string; email: string; name: string | null }): Promise<void> {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const message = `🎉 *New User Signup*

*Name:* ${user.name || 'Not provided'}
*Email:* ${user.email}
*User ID:* \`${user.id}\`
*Time:* ${timestamp} ET

Welcome to Zen Options! 🚀`;

    await this.sendMessage(message);
  }
}

export const adminNotificationService = new AdminNotificationService();
