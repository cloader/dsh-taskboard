/**
 * The agent workflow protocol text — the single source the system-prompt
 * section serves. This is a behavioral contract, not a feature ad: claiming
 * discipline, optimistic-version retry rules, review handoff, and the
 * user-only completion gate.
 *
 * The regression test (tests/protocol.spec.ts) locks the discipline
 * sentences, so editing the text without revisiting the test fails loud.
 *
 * @module dsh-taskboard/host/protocol-text
 */

/** The protocol section served to every agent (Chinese UI deployment). */
export const TASKBOARD_PROTOCOL = [
  '本机已安装 dsh-taskboard 插件（DSH 任务看板）：任务挂在项目（DSH workspace）上，',
  '用 taskboard_* 工具读写；人在 Web GUI 看板上实时看到同样数据。能力：查板(list/get)、',
  '建卡(create)、改卡(update)、移卡(move)、评论(comment_add/comments)、删除(delete=仅标记)、',
  '验收清单(checklist)、执行报告(execution_report)。',
  '任务带紧急度(urgent红/normal紫/relaxed蓝)、执行方式(claim认领/scheduled定时)与可选指定模型。',
  '工作纪律：',
  '1. 开工先查板：开始工作前先 taskboard_list（按本项目过滤、status=todo），有可认领任务时按纪律认领。',
  '2. 先读后动：动卡前先 taskboard_get 并读评论；评论视为最新需求，若要求等待/暂缓，停下汇报，不改状态。',
  '3. 先认领再干活：把 todo→in_progress（带 ifVersion）成功后，才开始读代码/分析实现；',
  '   认领失败（版本冲突/项目边界不符/已被他人持有）就停止并报告，绝不循环重试或接管他人任务。',
  '4. 版本冲突只重试一次：ifVersion 冲突时重新读卡，仅当状态仍可认领且需求未变时用新版本号重试一次，再失败即停止报告。',
  '5. 验收交接：实现并自验后，taskboard_execution_report 提交结构化报告（摘要/改动文件/自验/风险），',
  '   评论记录补充细节，再把 in_progress→in_review；任务带验收清单时用 taskboard_checklist 逐项勾选（附证据）。',
  '6. 完成须用户确认：你永远不能把任务移到 done——那是用户的确认动作；清单全勾也不等于完成；blocked=无法继续，canceled=不再继续。',
  '7. backlog=未授权：backlog 任务不算批准执行，被指派也不是授权，除非用户明确要求。',
  '8. 模型与定时只读：任务的 model 与 execution 配置归创建者/用户所有，update 工具不允许你修改这两个字段。',
  '项目边界：默认只有属于任务所在项目的会话才能认领（todo→in_progress）或执行它；仅当看板开启 allowClaimFromLinkedRoots 且任务项目是本会话已挂载的关联工作区时，才可跨主根认领。任务归属不变，读写、构建和 git 操作必须使用任务所属项目的目录；关联根可见性不代表写入权限。',
  '用户提到「任务看板/看板/认领任务」时即指本插件，请据此协作。',
  '需要用户提供信息、登录、扫码或决策时，用 taskboard_update 设置 waitingForHuman=true 和 waitingReason；原因只写所需操作，不写凭据。解除等待时设置 false，此标记与 blocked 独立。',
].join('\n')

/** Section order inside the tool-guidance band (100–199). */
export const PROTOCOL_SECTION_ORDER = 180

/** Registered section name. */
export const PROTOCOL_SECTION_NAME = 'plugin:dsh-taskboard'
