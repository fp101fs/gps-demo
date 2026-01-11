export interface Point {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface Journey {
  id: string;
  created_at: string;
  end_time?: string;
  is_active: boolean;
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