/** Official outreach templates. Senders pick one; they cannot rewrite the wording. */
export const MESSAGE_TEMPLATES = [
  { id: 'harvest', label: 'Harvest Field Invite', text: 'Dear {name}, you are warmly invited to our Harvest Field meeting this Sunday at 9:00 AM. Come and experience God\'s power! - Living Faith Church (Lekki Zone)' },
  { id: 'midweek', label: 'Midweek Service', text: 'Dear {name}, our midweek Bible study holds this Wednesday at 6:00 PM. Come hungry for the Word! - Living Faith Church (Lekki Zone)' },
  { id: 'wsf', label: 'WSF Meeting', text: 'Dear {name}, WSF holds this Saturday at 5:00 PM, a special session for new believers. You are welcome! - Living Faith Church (Lekki Zone)' },
  { id: 'shiloh', label: 'Shiloh 2026', text: 'Dear {name}, SHILOH 2026 holds December 7-11. Do not miss this divine encounter! - Living Faith Church (Lekki Zone)' },
  { id: 'follow-up', label: 'Follow-Up', text: 'Dear {name}, we are thinking of you and trust you are well. We look forward to seeing you at our next service. God bless! - Living Faith Church (Lekki Zone)' },
  { id: 'youth', label: 'Youth Programme', text: 'Dear {name}, our Youth Programme holds this Saturday! Bring a friend and celebrate God\'s grace. You are specially invited! - Living Faith Church (Lekki Zone)' },
] as const;

export type MessageTemplateId = (typeof MESSAGE_TEMPLATES)[number]['id'];

export function fillName(template: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || 'friend';
  return template.replace(/\{name\}/g, first);
}
