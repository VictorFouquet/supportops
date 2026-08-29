/** A rendered notification ready to be sent by a transport. */
export interface NotificationMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * How a notification reaches its recipient. One implementation exists today
 * (console); a real email transport implements the same interface.
 */
export interface Transport {
  send(message: NotificationMessage): Promise<void>;
}
