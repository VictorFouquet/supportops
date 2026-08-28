import type { NotificationMessage, Transport } from './transport.js';

/** Development transport: "sends" a message by logging it. */
export class ConsoleTransport implements Transport {
  async send(message: NotificationMessage): Promise<void> {
    console.log(
      `[notification] to=${message.to} subject=${JSON.stringify(message.subject)} body=${JSON.stringify(message.body)}`,
    );
  }
}
