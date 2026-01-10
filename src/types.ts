export interface Point {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface TrackerData {
  points: Point[];
  startTime?: number;
  endTime?: number;
  isActive: boolean;
  lastHeartbeat: number;
  current?: Point;
  autoStopped?: boolean;
}

export interface ApiResponse {
  success: boolean;
  userId?: string;
  shareUrl?: string;
  data?: TrackerData;
}
