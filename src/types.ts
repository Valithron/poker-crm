import type { EventStatus, InvitationStatus, RsvpStatus } from "../shared/domain";

export interface Organizer {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "organizer";
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface PokerEvent {
  id: string;
  title: string;
  startsAt: string;
  hostPlayerId: string | null;
  hostName: string | null;
  location: string;
  gameNotes: string | null;
  notes: string | null;
  status: EventStatus;
  attendanceCount: number;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface EventPlayer {
  id: string;
  eventId: string;
  playerId: string;
  displayName: string;
  invitationStatus: InvitationStatus;
  rsvpStatus: RsvpStatus;
  attended: boolean;
  checkedInAt: string | null;
  notes: string | null;
}

export interface EventAuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown>;
  organizerName: string;
  createdAt: string;
}

export interface DashboardData {
  activePlayerCount: number;
  nextEvent: PokerEvent | null;
  recentEvents: PokerEvent[];
}
