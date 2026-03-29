export interface TrainEvent {
  id: string;
  locoId: string;
  timestamp: string;
  stationId: string;
  speed: number;
  tcasStatus: 'Normal' | 'Downgraded' | 'Override';
  ebApplied: boolean;
  ebReason?: string;
  overrideAck: boolean;
  length: number;
  expectedLength: number;
  sosGenerated: boolean;
  healthScore: number; // 0-100
  faultType?: 'Hardware' | 'Software' | 'None';
}

export interface StationEvent {
  id: string;
  stationId: string;
  timestamp: string;
  rfSignalStrength: number; // -dBm
  commStatus: 'Online' | 'Intermittent' | 'Offline';
  packetLoss: number; // percentage
  hardwareHealth: number; // 0-100
  softwareVersion: string;
  faultType?: 'Hardware' | 'Software' | 'None';
}

export interface AnalysisResult {
  summary: string;
  trainFaults: { locoId: string; issue: string; type: 'Hardware' | 'Software' }[];
  stationFaults: { stationId: string; issue: string; type: 'Hardware' | 'Software' }[];
  recommendations: string[];
}
