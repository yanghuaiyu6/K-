import { deepEqual, equal } from '../test/assert';
import { energyStates, getEnergyState } from './states';

const expectedLabels = [
  '单边运行',
  '连续跳空',
  '分立跳空',
  '上涨动能不足',
  '下跌动能不足',
  '隐形动能不足',
  '零轴纠缠',
  '穿零轴变盘',
];

export const tests = [
  {
    name: 'energyStates maps every required state to a definition',
    run() {
      deepEqual(Object.values(energyStates).map((state) => state.label), expectedLabels);
      equal(getEnergyState('zeroAxisTangle').zeroAxisBehavior, 'tangle');
      equal(getEnergyState('continuousGap').gapMode, 'continuous');
      equal(getEnergyState('bearishMomentumLack').polarity, -1);
    },
  },
];
