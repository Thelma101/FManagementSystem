import type { AuthUser, MessageLog } from '../types';

export function senderFields(user: AuthUser) {
  return { sentBy: user.name, sentByEmail: user.email };
}

export function senderCaption(log: MessageLog) {
  if (log.kind === 'scheduled') return log.sentBy;
  return log.sentByEmail ? `by ${log.sentBy} · ${log.sentByEmail}` : `by ${log.sentBy}`;
}
