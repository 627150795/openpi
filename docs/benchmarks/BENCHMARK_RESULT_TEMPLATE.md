---
status: draft
created: YYYY-MM-DD
last-verified: YYYY-MM-DD
applies-to: <OpenPI version or source boundary>
related-issues: "#<number>"
related-prs: none
supersedes: none
---

# YYYY-MM-DD — <benchmark 名称>

运行生命周期（不替代文档状态）：`planned | running | complete | invalidated`

## 一句话结论

<用一句话写质量结果、主要资源差异和本次决策。>

## 问题与假设

- 比较问题：
- 主假设：
- 主质量指标：`artifact_pass_at_deadline`
- 资源指标：wall time、input、output、cache read/write、total tokens、估算成本、turn、tool calls、nested usage
- 本次结果允许支持的结论范围：

## 冻结环境

| 项目 | 值 |
| --- | --- |
| 日期与时区 |  |
| Runner commit |  |
| Pi 版本 |  |
| OpenPI commit / 配置 |  |
| Arm A |  |
| Arm B |  |
| Provider / model |  |
| Thinking |  |
| 任务源 commit |  |
| 每 cell deadline |  |
| 重复次数 |  |
| A/B 顺序 |  |
| 隔离 |  |

两组之间唯一允许的差异：<填写>。

## 题目

| Task ID | 语言 / 类型 | 要求摘要 | 隐藏验收 | 题源 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 运行前门禁

| 门禁 | 结果 | 证据 / 备注 |
| --- | --- | --- |
| Reference calibration |  |  |
| Arm A route-and-edit canary |  |  |
| Arm B route-and-edit canary |  |  |
| 凭据隔离 |  |  |
| 全进程树隔离与清理 |  |  |
| Verifier 后注入、断网运行 |  |  |

**身份与分类必须明确：** provider/model、thinking、任务源、verifier、隔离边界、样本量，以及 artifact、protocol、infrastructure/provider、verifier 失败分类。

任何门禁失败时，将 campaign 标记为 `invalidated`，不要继续解释模型优劣。

## 总体结果

| 指标 | Arm A | Arm B | B / A 或差值 |
| --- | ---: | ---: | ---: |
| Artifact passes |  |  |  |
| Protocol completions |  |  |  |
| Wall time |  |  |  |
| Input + output tokens |  |  |  |
| Cache read tokens |  |  |  |
| Total recorded tokens |  |  |  |
| 估算成本 |  |  |  |
| Parent turns |  |  |  |
| Parent tool calls |  |  |  |
| Nested tokens |  |  |  |

## 逐题结果

| Task | Arm | Pass | Protocol | Wall | In + out | Cache read | Total | Cost | Turns | Tools | Nested |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
|  |  |  |  |  |  |  |  |  |  |  |  |

## 运行行为

- 实际调用了哪些 OpenPI 能力：
- 没有调用哪些预期能力：
- 异常、重试、timeout、provider 或 verifier 事件：
- Tool footprint / first-request context：

## 分析

### 已观察事实

- <直接来自 ledger、artifact 或 verifier 的事实。>

### 原因推断

- <把推断与事实分开，并写明支持证据和替代解释。>

### 局限

- <样本量、任务代表性、顺序效应、成本口径、缺失数据等。>

## 决策与下一步

- 保留：
- 改进：
- 暂不做：
- 下一次 benchmark：
- 通过线：

## 原始证据

- Raw evidence：`<仓库外路径或归档 URI>`
- Runner：`<路径和 commit>`
- Run manifest SHA-256：
- Cells ledger SHA-256：
- Summary SHA-256：
- Archive file count / logical bytes：
- Complete archive manifest SHA-256：
- 其他证据 SHA-256：
- 凭据检查：`no auth, token, model registry, or private settings persisted`

## Amendments

无。后续解释变化按 `YYYY-MM-DD — <原因>` 追加，不覆盖原结论。
