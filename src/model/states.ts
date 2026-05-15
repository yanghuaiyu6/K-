import type { EnergyStateDefinition, EnergyStateId } from './types';

export const energyStates: Record<EnergyStateId, EnergyStateDefinition> = {
  oneSidedRun: {
    id: 'oneSidedRun',
    label: '单边运行',
    description: '小级别能量持续同向上传，当前级别波形稳定远离零轴。',
    polarity: 1,
    intensity: 1,
    gapMode: 'none',
    zeroAxisBehavior: 'normal',
  },
  continuousGap: {
    id: 'continuousGap',
    label: '连续跳空',
    description: '多个小级别单位调整周期连续跨越，形成阶梯式能量跳跃。',
    polarity: 1,
    intensity: 1.25,
    gapMode: 'continuous',
    zeroAxisBehavior: 'normal',
  },
  separateGap: {
    id: 'separateGap',
    label: '分立跳空',
    description: '能量上传出现间隔，当前级别以离散脉冲方式响应。',
    polarity: 1,
    intensity: 0.9,
    gapMode: 'separate',
    zeroAxisBehavior: 'normal',
  },
  bullishMomentumLack: {
    id: 'bullishMomentumLack',
    label: '上涨动能不足',
    description: '价格线段仍在零轴上方，但峰值逐级降低，上传效率衰减。',
    polarity: 1,
    intensity: 0.45,
    gapMode: 'none',
    zeroAxisBehavior: 'normal',
  },
  bearishMomentumLack: {
    id: 'bearishMomentumLack',
    label: '下跌动能不足',
    description: '下跌线段仍在零轴下方，但谷值逐级抬高，空方动能衰减。',
    polarity: -1,
    intensity: 0.45,
    gapMode: 'none',
    zeroAxisBehavior: 'normal',
  },
  hiddenMomentumLack: {
    id: 'hiddenMomentumLack',
    label: '隐形动能不足',
    description: '表层线段维持趋势，内部小级别能量已提前背离。',
    polarity: 0,
    intensity: 0.62,
    gapMode: 'none',
    zeroAxisBehavior: 'normal',
  },
  zeroAxisTangle: {
    id: 'zeroAxisTangle',
    label: '零轴纠缠',
    description: '多级别波形围绕各自零轴反复缠绕，方向暂未确认。',
    polarity: 0,
    intensity: 0.35,
    gapMode: 'none',
    zeroAxisBehavior: 'tangle',
  },
  zeroCrossTurn: {
    id: 'zeroCrossTurn',
    label: '穿零轴变盘',
    description: '小级别先穿越零轴，上传后推动当前级别发生方向切换。',
    polarity: 0,
    intensity: 0.85,
    gapMode: 'none',
    zeroAxisBehavior: 'cross',
  },
};

export function getEnergyState(stateId: EnergyStateId): EnergyStateDefinition {
  return energyStates[stateId];
}
