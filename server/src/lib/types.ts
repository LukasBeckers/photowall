// Shared client/server types
export interface PhotoSummary {
  id: string;
  uploader: string;
  source: 'guest' | 'sdcard';
  width: number;
  height: number;
  uploadedAt: string;
  takenAt: string | null;
  reactions: Record<string, number>;
  mime: string;
  thumb: string;
  wall: string;
  original: string;
  // Smaller H.264 MP4 used by the wall instead of the original. Only set
  // for videos. The wall page falls back to `original` if absent.
  wallVideo?: string;
  speed: number; // playback rate; 1.0 = normal. Only meaningful for videos.
}

export interface PhotoListResponse {
  photos: PhotoSummary[];
  nextBefore: string | null;
}

export function isVideo(p: { mime: string }): boolean {
  return p.mime.startsWith('video/');
}
