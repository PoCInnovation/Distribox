import type {
  Event,
  CreateEventPayload,
  UpdateEventPayload,
  EventJoinResponse,
} from "@/lib/types/event";
import {
  EventSchema,
  CreateEventPayloadSchema,
  EventJoinResponseSchema,
} from "@/lib/types/event";
import { apiRequest, validateWithSchema } from "./core";

export async function getEvents(): Promise<Event[]> {
  return apiRequest("/events", {}, EventSchema.array());
}

export async function getEvent(eventId: string): Promise<Event> {
  return apiRequest(`/events/${eventId}`, {}, EventSchema);
}

export async function createEvent(payload: CreateEventPayload): Promise<Event> {
  const validated = validateWithSchema(
    CreateEventPayloadSchema,
    payload,
    "/events",
  );
  return apiRequest(
    "/events",
    { method: "POST", body: JSON.stringify(validated) },
    EventSchema,
  );
}

export async function updateEvent(
  eventId: string,
  payload: UpdateEventPayload,
): Promise<Event> {
  return apiRequest(
    `/events/${eventId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    EventSchema,
  );
}

export async function deleteEvent(eventId: string): Promise<void> {
  await apiRequest(`/events/${eventId}`, { method: "DELETE" });
}

export async function deleteEventVm(
  eventId: string,
  vmId: string,
): Promise<void> {
  await apiRequest(`/events/${eventId}/vms/${vmId}`, { method: "DELETE" });
}

export async function getPublicEvent(slug: string): Promise<Event> {
  return apiRequest(`/events/public/${slug}`, { public: true }, EventSchema);
}

export async function joinEvent(
  slug: string,
  participantName: string,
): Promise<EventJoinResponse> {
  return apiRequest(
    `/events/public/${slug}/join`,
    {
      method: "POST",
      body: JSON.stringify({ participant_name: participantName }),
      public: true,
    },
    EventJoinResponseSchema,
  );
}
