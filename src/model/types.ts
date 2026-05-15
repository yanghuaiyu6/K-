export type TrendDirection = 'up' | 'down';

export type EnergyStateId =
  | 'oneSidedRun'
  | 'continuousGap'
  | 'separateGap'
  | 'bullishMomentumLack'
  | 'bearishMomentumLack'
  | 'hiddenMomentumLack'
  | 'zeroAxisTangle'
  | 'zeroCrossTurn';

export interface EnergyStateDefinition {
  id: EnergyStateId;
  label: string;
  description: string;
  polarity: -1 | 0 | 1;
  intensity: number;
  gapMode: 'none' | 'continuous' | 'separate';
  zeroAxisBehavior: 'normal' | 'tangle' | 'cross';
}

export interface TimeframeDefinition {
  id: string;
  label: string;
  minutes: number;
  color: string;
}

export interface ModelConfig {
  canvasWidth: number;
  canvasHeight: number;
  observationHeight: number;
  layerHeight: number;
  layerGap: number;
  leftPadding: number;
  rightPadding: number;
  zeroAxisDash: number[];
  uploadParticleCount: number;
}

export interface ScenarioDefinition {
  id: string;
  label: string;
  description: string;
  currentTimeframeId: string;
  stateId: EnergyStateId;
  direction: TrendDirection;
  phaseShift: number;
}

export interface EnergyLayer {
  timeframe: TimeframeDefinition;
  index: number;
  role: 'smaller' | 'current' | 'larger';
  zeroY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  uploadStrength: number;
  state: EnergyStateDefinition;
}
