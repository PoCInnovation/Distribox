import { create } from "zustand";

interface IPVisibilityState {
  visibleIPs: Set<string>;
  showIP: (vmId: string) => void;
  hideIP: (vmId: string) => void;
  isIPVisible: (vmId: string) => boolean;
}

export const useIPVisibilityStore = create<IPVisibilityState>((set, get) => ({
  visibleIPs: new Set<string>(),

  showIP: (vmId: string) => {
    set((state) => ({
      visibleIPs: new Set(state.visibleIPs).add(vmId),
    }));
  },

  hideIP: (vmId: string) => {
    set((state) => {
      const newSet = new Set(state.visibleIPs);
      newSet.delete(vmId);
      return { visibleIPs: newSet };
    });
  },

  isIPVisible: (vmId: string) => {
    return get().visibleIPs.has(vmId);
  },
}));
