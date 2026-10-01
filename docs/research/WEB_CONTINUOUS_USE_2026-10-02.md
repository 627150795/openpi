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
| 会话行操作显示 | hover、focus 与已打开的菜单显示操作；普通行保持紧凑，触屏选中行后仍可通过焦点显示入口。 |

## 验证与限制

实现先在旧 Pi 0.85.1 基线完成专项，再安全提交并迁移至上述最新 main / Pi 0.99.1。旧专项是 checkpoint，不代替新基线完整验收。真实 Host、native fixture、store/component 与浏览器模拟 admission 分别记录，不混淆真实模型结果和合成测试。

私有原始证据稳定身份为 `openpi-web-audit-598-2026-09-30/continuous-use-20261002`，由操作者保留；公开回归位于 `tests/web/`。原始 Session、凭据、竞品源码与截图不发布到仓库。该归档身份不构成公开可获取的独立证据。

前轮第六浏览器页签的输入边界已定位并用原始扩展重复验证；Chromium 内部原因仍未知。本轮不以完整 Chromium 套件的绿色结果扩张为 Safari、真实移动软键盘或跨浏览器兼容保证。

最终门禁、消融与发布结果在实现冻结后补记。
