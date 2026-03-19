import { z } from "zod";

export const EventParticipantSchema = z.object({
  id: z.string().uuid(),
  participant_name: z.string(),
  vm_id: z.string().uuid(),
  created_at: z.string(),
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  vm_os: z.string(),
  vm_distribution: z.string(),
  vm_mem: z.number(),
  vm_vcpus: z.number(),
  vm_disk_size: z.number(),
  keyboard_layout: z.string().nullable().optional(),
  deadline: z.string().transform((s) => (s.endsWith("Z") ? s : s + "Z")),
  max_vms: z.number(),
  created_at: z.string(),
  created_by: z.string(),
  participants_count: z.number(),
  participants: z.array(EventParticipantSchema),
});

export type Event = z.infer<typeof EventSchema>;
export type EventParticipant = z.infer<typeof EventParticipantSchema>;

export const CreateEventPayloadSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  vm_os: z.string().min(1),
  vm_distribution: z.string().default(""),
  vm_mem: z.number().positive(),
  vm_vcpus: z.number().positive(),
  vm_disk_size: z.number().positive(),
  keyboard_layout: z.string().nullable().optional(),
  deadline: z.string(),
  max_vms: z.number().positive(),
});

export type CreateEventPayload = z.infer<typeof CreateEventPayloadSchema>;

export const UpdateEventPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  vm_os: z.string().min(1).optional(),
  vm_mem: z.number().positive().optional(),
  vm_vcpus: z.number().positive().optional(),
  vm_disk_size: z.number().positive().optional(),
  deadline: z.string().optional(),
  max_vms: z.number().positive().optional(),
});

export type UpdateEventPayload = z.infer<typeof UpdateEventPayloadSchema>;

export const EventJoinResponseSchema = z.object({
  vm_id: z.string().uuid(),
  vm_name: z.string(),
  credential_name: z.string(),
  credential_password: z.string(),
});

export type EventJoinResponse = z.infer<typeof EventJoinResponseSchema>;
