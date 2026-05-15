import { energyStates } from '../model/states';
import { timeframes } from '../model/timeframes';
import type { EnergyStateId, ScenarioDefinition, TrendDirection } from '../model/types';
import { scenarios } from '../model/scenarios';

interface ControlPanelProps {
  scenario: ScenarioDefinition;
  onScenarioChange: (scenario: ScenarioDefinition) => void;
}

export function ControlPanel({ scenario, onScenarioChange }: ControlPanelProps) {
  const state = energyStates[scenario.stateId];

  function patchScenario(patch: Partial<ScenarioDefinition>) {
    onScenarioChange({ ...scenario, ...patch, id: 'custom', label: '自定义观察', description: '通过控制面板组合出的稳定重构场景。' });
  }

  return (
    <aside className="control-panel">
      <div>
        <p className="eyebrow">控制面板</p>
        <h2>递归能量观察器</h2>
        <p className="panel-copy">切换时间级别、状态和方向，观察小级别如何先运行，并逐层影响当前级别与大一级别。</p>
      </div>

      <label>
        预设场景
        <select value={scenario.id} onChange={(event: any) => onScenarioChange(scenarios.find((item) => item.id === event.target.value) ?? scenario)}>
          {scenario.id === 'custom' && <option value="custom">自定义观察</option>}
          {scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>

      <label>
        当前时间级别
        <select value={scenario.currentTimeframeId} onChange={(event: any) => patchScenario({ currentTimeframeId: event.target.value })}>
          {timeframes.map((timeframe) => <option key={timeframe.id} value={timeframe.id}>{timeframe.label}</option>)}
        </select>
      </label>

      <label>
        模型状态
        <select value={scenario.stateId} onChange={(event: any) => patchScenario({ stateId: event.target.value as EnergyStateId })}>
          {Object.values(energyStates).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>

      <label>
        线段方向
        <select value={scenario.direction} onChange={(event: any) => patchScenario({ direction: event.target.value as TrendDirection })}>
          <option value="up">零轴上方：上涨线段</option>
          <option value="down">零轴下方：下跌线段</option>
        </select>
      </label>

      <section className="state-card">
        <span>{state.label}</span>
        <p>{state.description}</p>
      </section>
    </aside>
  );
}
