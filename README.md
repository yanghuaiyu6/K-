# ReplayTrader 中文版

按 [ReplayTrader](https://replaytrader.app/) 核心流程复刻的中文练习 / 模拟盘：新建会话 → 逐根回放交易 → 结束复盘。

## 功能概览

- **行情**：OKX 公共实盘 K 线（支持的品种自动/强制实盘）+ 本地长序列模拟回退
- **交易**：市价 / 限价 / 止损、杠杆、保证金校验、滑点、止盈止损、部分平仓、简化资金费与强平
- **回放**：数据起点 / 随机时间 / 选点 / 进度条（有仓位时跳转需确认）
- **图表**：成本价 / 强平价 / 挂单参考线，MA20 + EMA60 + MACD
- **账户**：同屏下单、持仓抽屉、会话本地持久化、练习日记、权益曲线报告
- **单位**：金额 USDT / 人民币切换（外汇报价不误乘汇率）

## 快捷键

`Space` 播放/暂停，`←/→` 逐根，`B` 开多，`S` 开空，`X` 平仓。

## 安装 APK

- [Release 页面](https://github.com/yanghuaiyu6/K-/releases/tag/v0.1.0-debug)
- [直接下载 APK](https://github.com/yanghuaiyu6/K-/releases/download/v0.1.0-debug/replay-trader-cn-debug.apk)

请用系统浏览器或 Chrome 下载，不要用微信内置浏览器。

## 本地运行

```bash
npm install
npm run dev
```

```bash
npm run build
npm test
npm run apk:debug
```

说明：实盘行情依赖网络访问 OKX 公共接口；不可用时自动回退本地模拟数据。
