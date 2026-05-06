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
}

export interface PhotoListResponse {
  photos: PhotoSummary[];
  nextBefore: string | null;
}

export function isVideo(p: { mime: string }): boolean {
  return p.mime.startsWith('video/');
}
