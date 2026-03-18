import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  deleteEventVm,
} from "@/lib/api/events";
import type {
  Event,
  CreateEventPayload,
  UpdateEventPayload,
} from "@/lib/types/event";

export function useEvents() {
  return useQuery<Event[]>({
    queryKey: ["events"],
    queryFn: getEvents,
    retry: false,
  });
}

export function useEvent(eventId: string) {
  return useQuery<Event>({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId),
    enabled: !!eventId,
    retry: false,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEventPayload) => createEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      payload,
    }: {
      eventId: string;
      payload: UpdateEventPayload;
    }) => updateEvent(eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useDeleteEventVm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, vmId }: { eventId: string; vmId: string }) =>
      deleteEventVm(eventId, vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
