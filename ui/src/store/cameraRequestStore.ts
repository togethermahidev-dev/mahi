import { create } from 'zustand';
import type { SharedPhoto } from '@/lib/sharedPhoto';

/**
 * Something from outside the app for the Camera page to do once it shows: photos shared from
 * Photos (switch `share-to-mahi`). In memory only; the Camera page takes it (and so clears it).
 */
export type CameraRequest = { kind: 'shared-photos'; photos: SharedPhoto[] };

interface CameraRequestState {
  request: CameraRequest | null;
  ask: (request: CameraRequest) => void;
  /** Hands over the waiting request, once. */
  take: () => CameraRequest | null;
  reset: () => void;
}

export const useCameraRequestStore = create<CameraRequestState>((set, get) => ({
  request: null,
  ask: (request) => set({ request }),
  take: () => {
    const { request } = get();
    if (request) set({ request: null });
    return request;
  },
  reset: () => set({ request: null }),
}));
