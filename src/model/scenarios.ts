import type { ScenarioDefinition } from './types';

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'trend-push',
    label: '小级别连续推动',
    description: '观察小级别先运行，并通过右侧能量光点逐层推动当前和大级别。',
    currentTimeframeId: '15m',
    stateId: 'oneSidedRun',
    direction: 'up',
    phaseShift: 0.1,
  },
  {
    id: 'gap-relay',
    label: '跳空中继',
    description: '连续跳空映射为阶梯状上传；当前级别单位调整周期之间仍落在大级别周期之内。',
    currentTimeframeId: '60m',
    stateId: 'continuousGap',
    direction: 'up',
    phaseShift: 0.35,
  },
  {
    id: 'momentum-warning',
    label: '动能不足预警',
    description: '当前趋势延续，但内部层级已出现上传不足和峰谷收敛。',
    currentTimeframeId: '15m',
    stateId: 'hiddenMomentumLack',
    direction: 'down',
    phaseShift: 0.7,
  },
  {
    id: 'zero-axis-turn',
    label: '零轴变盘观察',
    description: '小级别先穿零轴，当前级别随后响应，大级别仍处在单位调整周期内。',
    currentTimeframeId: '5m',
    stateId: 'zeroCrossTurn',
    direction: 'up',
    phaseShift: 1.1,
  },
];
