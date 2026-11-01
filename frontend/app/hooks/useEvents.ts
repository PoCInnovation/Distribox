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

// Seat counts move while an event is open. Callers that only read past
// setups pass false and still see the list's updates through the cache.
export function useEvents(
  enabled = true,
  refetchInterval: number | false = 15_000,
) {
  return useQuery<Event[]>({
    queryKey: ["events"],
    queryFn: getEvents,
    enabled,
    retry: false,
    refetchInterval,
  });
}

export function useEvent(eventId: string) {
  return useQuery<Event>({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId),
    enabled: !!eventId,
    retry: false,
    // New participants show up without a reload.
    refetchInterval: 5_000,
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
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: ["vm-ssh"] });
      queryClient.invalidateQueries({ queryKey: ["ssh-connection"] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
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
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });
}
