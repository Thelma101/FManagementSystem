import type { Contact, EstablishmentStage } from '../types';

export const ESTABLISHMENT_STAGES: { id: EstablishmentStage; label: string; hint: string }[] = [
  { id: 'encounter', label: 'Encounter', hint: 'Contact captured from harvest field' },
  { id: 'follow_up', label: 'Follow-up', hint: 'Worker assigned / welcome underway' },
  { id: 'believers_class', label: "Believer's class", hint: 'Enrolled or completed Believer’s class' },
  { id: 'baptismal_class', label: 'Baptismal class', hint: 'Enrolled or completed baptismal class' },
  { id: 'wofbi', label: 'WOFBI', hint: 'Bible school / WOFBI in progress or done' },
  { id: 'established', label: 'Established', hint: 'Settled in faith and fellowship' },
];

export function stageLabel(stage?: EstablishmentStage): string {
  return ESTABLISHMENT_STAGES.find((s) => s.id === stage)?.label ?? 'Encounter';
}

/** Suggest next stage from evidence dates (does not auto-write). */
export function suggestedStage(c: Pick<Contact, 'believersClassAt' | 'baptismalClassAt' | 'wofbiAt' | 'establishedAt' | 'assignedTo' | 'welcomeSentAt'>): EstablishmentStage {
  if (c.establishedAt) return 'established';
  if (c.wofbiAt) return 'wofbi';
  if (c.baptismalClassAt) return 'baptismal_class';
  if (c.believersClassAt) return 'believers_class';
  if (c.assignedTo || c.welcomeSentAt) return 'follow_up';
  return 'encounter';
}
