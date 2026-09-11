import type { HealthAnnotation } from "../shared/contracts.js";

export interface BayMapRow {
  bayId: string;
  spaceNumber: string;
  designation: string;
  garage: string;
  floor: number;
}

export interface ParkAssistPlate {
  text?: string;
  confidence?: number;
  timestamp?: string;
}

export interface ParkAssistVisit {
  id?: string | number;
  entry_timestamp?: string;
  exit_timestamp?: string;
  dwell?: number;
  plate?: ParkAssistPlate;
}

export interface ParkAssistSensor {
  address?: string;
  confidence?: number;
  last_contact?: string;
  last_contact_reason?: string;
  thumbnail_timestamp?: string;
}

export interface ParkAssistBay {
  id: string | number;
  is_occupied?: boolean;
  is_out_of_service?: boolean;
  is_reserved?: boolean;
  visit?: ParkAssistVisit;
  sensor?: ParkAssistSensor;
}

export interface MergedGarageBay extends BayMapRow {
  foundInLiveApi: boolean;
  occupied: boolean;
  outOfService: boolean;
  reserved: boolean;
  plate?: string;
  plateConfidence?: number;
  visitEnteredAt?: string;
  thumbnailTimestamp?: string;
  thumbnailAgeMinutes?: number;
  lastContact?: string;
  lastContactAgeMinutes?: number;
  health?: HealthAnnotation;
}
