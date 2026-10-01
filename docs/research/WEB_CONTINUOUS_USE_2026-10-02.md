# OpenPI Web 连续使用：重跑、刷新、文件与多终端

- Status: draft
- Created: 2026-10-02
- Issue: [#641](https://github.com/openpi-dev/openpi/issues/641)，后续于 [#639](https://github.com/openpi-dev/openpi/issues/639)
- Base: `c230909`，已合并 [#640](https://github.com/openpi-dev/openpi/pull/640) 与 Pi 0.99.1 兼容更新 [#636](https://github.com/openpi-dev/openpi/pull/636)
- Scope: OpenPI Web 的连续使用；不是新原生 App、跨产品性能 Benchmark 或已接受的项目 Decision。
- Related record: [之前的交互比较与失败记录](WEB_INTERACTION_COMPARISON_2026-09-30.md)

## 参考与实现边界

用户指定以 Codex 的使用方式为主要参考。官方 [Remote engineering guidance](https://developers.openai.com/blog/mastering-codex-remote-for-engineering) 支持历史分叉与编辑请求的产品流程；不据此宣称本机 Codex 的每项细节或像素布局已实测。Pi Web 的 `components/SettingsPanel.tsx`，冻结于 `4a5081a3d9a993fa77553c62196cc0a2b48ed810`，提供 General 页的即时保存开关、滑条和重置交互；OpenPI 包独有的 Subagent/Bash/Write/Edit 与终端 Footer 配置沿用自己的已有规范，不伪称 Pi Web 同名功能。

| 行为 | 所有者与边界 |
| --- | --- |
| 修改旧请求并重跑、重新生成 | Pi 原生 `AgentSession.fork` 选择请求之前的分支；模型调用仍由既有 Web prompt admission ledger 接收。源 Session 文件不改写；完整原生内容和图片进入新请求，拒绝时可恢复输入。 |
| 刷新后的阅读位置 | 浏览器保存精确 Session id/path、原生 entry 和偏移；历史窗口重新向 Pi 查询。工具只保存有界视图元数据，文件版本与终端进程均由其 owner 重新校验；不把资源 ID 当作运行事实。 |
| 文件整理 | 既有 trusted workspace、精确 Session、Pi 单文件写队列和 filesystem identity。移动不覆盖；回收站为工作区内私有、ignored、可恢复的文件操作证据，不是另一份 Session 存储。目录导入沿用已有导入验证。 |
| 多终端与完整 launcher | 同一 Session 可有独立 PTY、命名、输入/输出和关闭。创建 key 只保证每个页签幂等，不推断旧进程仍活着；刷新后查询 owner，Session 切换仍遵守已有清理边界。 |
| 常规设置可操作 | 结果显示与 Pi 终端 Footer 直接保存已有 presentation fields；能力发现、工作流上限、建议与 post-edit 通过 `/openpi-setup`。界面不把模型声称成功替代实际写入回执。 |
| 会话行操作显示 | hover、focus 与已打开的菜单显示操作；普通行保持紧凑，触屏保留当前选中行入口，关闭再打开侧栏仍可操作。 |

## 验证与限制

实现先在旧 Pi 0.85.1 基线完成专项，再安全提交并迁移至上述最新 main / Pi 0.99.1。旧专项是 checkpoint，不代替新基线完整验收。真实 Host、native fixture、store/component 与浏览器模拟 admission 分别记录，不混淆真实模型结果和合成测试。

私有原始证据稳定身份为 `openpi-web-audit-598-2026-09-30/continuous-use-20261002`，由操作者保留；公开回归位于 `tests/web/`。原始 Session、凭据、竞品源码与截图不发布到仓库。该归档身份不构成公开可获取的独立证据。

前轮第六浏览器页签的输入边界已定位并用原始扩展重复验证；Chromium 内部原因仍未知。本轮不以完整 Chromium 套件的绿色结果扩张为 Safari、真实移动软键盘或跨浏览器兼容保证。

最终门禁、消融与发布结果在实现冻结后补记。

### 消融与失败证据

- 删除终端创建的第二份 key→id 映射和重复查找后，原生有界 records 与 pending receipt 仍通过幂等、容量和取消回归，因此保留更小的实现。
- 删除文件移动的嵌套目标写队列；源对象的 Pi 原生队列与独占目标提交足以覆盖普通重名冲突，且避免 canonical alias 共用队列的死锁。目录独占 reservation 的独立消融允许竞争方抢占目标，回归失败，因此恢复该机制。
- 移除历史窗口的有限后续上下文，刷新原生 anchor 在末端被夹限，实测偏移 425.75px；恢复同一有界 native message-window 后，案例偏移不超过 2px。未增加伪占位高度或第二份历史存储。
- 移除 full 结果的外层 execution group 自动展开后，Bash/file 的完整结果验收失败，因此保留让既有显示配置实际可见的行为。
- 触屏完全隐藏行操作时，关闭再打开侧栏会失去入口；最小修正仅保留当前选中行。菜单截图等待真实 opacity 并禁用截图动画，不用重试点击替代交互验收。

真实 `audit-local/gpt-6-luna` 隔离 smoke 于 `fd5d597d447500c1af479374b6d65df16d9cf15c` 完成编辑与重新生成两次短 turn，同模型、原生 completed、排除旧未来回答，原 Session 与被重新生成的版本字节均不变，普通 read/bash/edit/write 工具保持开启。首次 preflight 因私有模型环境未继承而停在模型调用之前；仅复用已授权审计 profile 所需变量后成功，没有再试其他模型。凭据及 Session 原始文件不公开。

首次全量 Node 测试揭示旧 asset 断言禁止所有 localStorage，与新增有界视图书签冲突；保留禁止浏览器 archive 状态的断言，明确允许两种已验证 metadata key。其后 Node 全绿，Vitest 和首轮完整 Chrome 揭示旧编辑入口断言及 fixture 状态隔离问题；更新至原生分叉交互仍保留完整文本、附件、源分支不变、尺寸、阅读位置和取消验收，未修改产品来迎合旧测试。失败日志与修正后的结果分别保存。

## 本轮之后的基础功能缺口

以下是当前源码检查支持的后续候选，不是本轮新增回归或已接受的功能 Decision：

1. 聊天正文的完整阅读：`web/ui/src/components/Markdown.tsx` 尚未接入数学排版，Mermaid fenced block 仍为代码，普通代码块缺少语言标题和语法高亮。代码复制和横向滚动已经存在；文件预览已有 Mermaid/高亮，可作为复用入口。
2. 会话导出与批量整理：`SessionSidebar.tsx` 提供重命名、归档/恢复、置顶和排序，但没有导出或多选归档的 Web 入口。后续应复用 Pi 原生导出完整分支，不能只导出当前页面已加载的历史窗口。
3. 后台系统提醒：页面内已有未读、失败、待输入投影，但未接入浏览器系统通知及主动启用入口。后续仍应消费原生终态与待输入事实，不从文字推断完成。

Safari、实体手机软键盘和 Windows 原生操作属于验证不确定项，不能据此写成这些平台的功能缺失。上述三项不阻止按当前 Chrome/macOS 验证范围发布连续使用修复。
