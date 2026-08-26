# Benchmark 账本

本目录是 Benchmark 协议与正式结果的 canonical source。GitHub Issue 负责公开摘要和讨论；本目录负责冻结条件、完整解释、限制和复跑入口；完整 JSONL、日志、Session 与候选工作区保存在单独的 operator-local archive，并通过 [`evidence/2026-08-26-openai-luna-high-manifest.sha256`](evidence/2026-08-26-openai-luna-high-manifest.sha256) 等 manifest 定位。

新记录至少声明：`status`、创建/验证日期、适用 revision、相关 Issue/PR、模型与 thinking、任务/verifier 身份、样本量、隔离与失败分类、证据 manifest、局限和下一步。结果不能只由 Issue 摘要替代。

## Canonical records

- [2026-08-26 OpenAI Luna high：Bare Pi vs OpenPI](runs/2026-08-26-openai-luna-high-pi-vs-openpi.md) — 60-cell explicit/adaptive 对照；对应 [Issue #197](https://github.com/tt-a1i/openpi/issues/197)。
- [Benchmark result template](BENCHMARK_RESULT_TEMPLATE.md) — 新 campaign 的完整记录模板。
- [Pi/OpenPI benchmark protocol](PI_OPENPI_BENCHMARK_PROTOCOL.md) — 比较合同、信任边界和停止规则。

单次运行的数字、结论与决策只保存在对应 dated record 中，分类 README 不复制第二份事实源。执行合同见 [`PI_OPENPI_BENCHMARK_PROTOCOL.md`](PI_OPENPI_BENCHMARK_PROTOCOL.md)，记录形状与字段要求见 [`BENCHMARK_RESULT_TEMPLATE.md`](BENCHMARK_RESULT_TEMPLATE.md)。历史本地记录在完成安全审查并被选择性纳入 Git 前，不作为 clean-checkout 导航目标。
