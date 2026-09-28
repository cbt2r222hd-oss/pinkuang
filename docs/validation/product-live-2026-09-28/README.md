# 三位显示、用户挂单与新图接入的线上记录

2026-09-28 04:48 UTC 首次激活 [用户主页](https://tapeout.cc.cd/bemine-v2/) 和更新后的 [部署台](https://tapeout.cc.cd/pinkuang-deploy-v2/)，05:05 UTC 完成后续索引/报价路由热修。源码分支为 `codex/contracts-v2-integration`，当前后台/索引来源为 `c90c25531e57bbcb89d710704625a65618275ae2`，产品静态构建仍为 `7b5176a769cf330ecebb609fbcacc5dd64a4306f`。后续运维、文档提交不会重新标记已发布包或合约产物的来源。

| 产物 | 固定身份 |
|---|---|
| 当前运行时发布 | `v2-20260928-c90c255`，128 个文件 |
| 当前运行时清单 SHA256 | `1038ecc1539a3997aead8c4dff495d29a0f1660529afdf6cea8b4985e00a8055` |
| 用户站发布 | `v2-product-20260928-7b5176a`，296 个文件 |
| 用户站清单 SHA256 | `c8f59d8717681bed3c12493464a6bf68e0804e60685d5b354d66d9b0de71381c` |
| 合约产物来源 | `8c5598cf44fe8fb6174969eba12b3baa13f7942b`，本轮未改 Solidity |
| 合约产物摘要 | `0x7617c81d718e2127be6b1878abad81d7a3c8bf9c4f8cb35bf85755e42df049d7` |
| 初始化块 | `124453751` |

新 core Factory 为 `0x2995B10d19056c8C24C57b281C22562a603C571F`，预算 Factory 为 `0x07FC0b1118529bA3c7C406058699b9B57Dd9e360`。完整公共清单随网站构建发布，见 [合约清单](../../deployments/integrated-v2-frontend-manifest-20260928.json)；[逐笔回执和图验证](deployed-graph-readonly.json) 来自真实链上只读核验，不是模拟地址。

金额、产能、参考价统一 BigInt 三位四舍五入；排序、资金校验和交易仍用原始整数。持有人从资产行或市场本人持仓直接挂单，不需要管理员代挂。线上报价的两种排序各核对 30 台纯验证矿机，参考价原值 `8037551440329218106` 显示 `8.038`。桌面和 390px 均无页面、资源错误，无钱包连接或交易；见 [报价证据](quotes-browser.json)。

新索引从真实初始化块完整回放，四个 Factory/Market 地址、两种项目的历史数量、规范块哈希与近期安全头全部核对。第一次 120 秒窗口未追齐，自动恢复原服务和路由，日志与索引进度未覆盖，见 [首次日志](activation-initial.log)、[回滚复核](initial-rollback.json)。重试使用独立备份、1200 秒有限窗口和每 10 秒进度，在约 1000 秒后通过安全块 `124463446` 的完整核验；见 [激活日志](activation-retry1.log)。期间观察到节点间歇读取失败，不能将当前成功快照解释为第三方 RPC 永久可用。

旧五个服务的 PID/InvocationID、三个旧 current 指针、部署 journal 的 inode 保留；没有重播原 16 笔交易，没有自动启用通知或 keeper。代理只新增 `/bemine-v2/`，4174/4181 仍只监听 loopback。公开 HTML、公共清单和合约产物按发布包哈希校验，未登录日志接口返回 401。首次运行时 `7b5176a` 的 [三项 CI](runtime-ci.json) 全部成功；本轮运维配置/故障恢复 [17 项测试](ops-tests.log) 通过。

首次整页验收没有全部通过：[服务器复核](initial-live-check.json) 70/73 项通过，索引健康3项失败；[浏览器错误记录](initial-product-errors.json) 显示币价404和索引503。币价服务本身正常，缺少的是新路径到 `/var/www/bemine-preview/data/bem-price.json` 的精确映射。索引的四类固定地址日志串行等待带来延迟，普通区块读取和日志读取的节点实测见 [RPC 对照](rpc-diagnosis.md)。

后续 `c90c255` 同时保留12秒 primary读取、独立配置30秒日志期限，并发读取四类全局日志；所有请求结束后才抛错或处理动态项目，未放宽规范块、完整历史或SQLite事务。Windows和Linux各32项回归见 [索引测试](../index-timeout-2026-09-28/summary.json)。热修脚本的16项回归见 [运维测试](hotfix-ops-tests.log)。[实际热修日志](runtime-hotfix.log) 确认产品目录、两数据库inode以及新增纳入检查的原币价服务均保留；新报价路径返回真实新鲜JSON，未映射旧的部署清单。90秒内9次索引观察有3次完整规范快照，来自3个不同完成周期，中间6次处于未完成/不可用状态；这证明能持续完成多个周期，不代表任何时刻读取都不会遇到503。

热修 `c90c255` 的 [三项 CI](hotfix-ci.json) 全部成功；05:06 UTC 独立服务器验收 [81/81 通过](hotfix-server-check.json)，对应规范索引块 `124465841`。但同轮 [用户整页检查](hotfix-product-errors.json) 仍发现参与页请求在正常同步窗口遇到503，短重试耗尽后留在错误状态；不能用服务器某一时刻通过来替代页面整流程验收。币价404已经消失。后续前端修复与验收另记，保留本轮失败证据。

旧 Factory `0xcB24E7F96D81037086A268d6ea63c53f91D412A2` 的停建条件仍由服务端在每次新建预检及签名前固定块检查。旧 owner 需要亲自在钱包签署 `pauseCreation(true)`，并确认旧工厂仍为零池。此门禁不会阻断已有持有人的撤单、退款、收益领取。单机、预算、官网/Firsto 采购及出售的真实钱包业务测试仍需用户按 [小额测试顺序](../../RELEASE_V2_START_HERE.md) 完成；本次网页上线和只读检查不代替资金交易验收。
