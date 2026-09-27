# BEMine 主网页面接入与测试记录

更新：2026-09-27。采用用户最后确认的方案：保留朋友设计的主页，在现有芯火夺宝服务器接入实际业务；取消 TapeKit 容器部署，不上传 TapeKit，不重部署合约。

## 入口与合约

- 产品页面：<https://tapeout.cc.cd/bemine/>
- 管理员部署记录：<https://tapeout.cc.cd/pinkuang-deploy/>
- 网络：BSC 主网，chainId `56`。
- Factory：`0xcB24E7F96D81037086A268d6ea63c53f91D412A2`
- ShareMarket：`0x0B274eFD3E33139209D1C62512F7e2345F16dD3c`
- 运营地址：`0x6F4d78fB59eC938cBAF65b9fc822aD04d00c155E`
- 初始化区块：`124286242`；既有部署记录为 13/13 完成。
- 合约基线：`200e5444d945e0426228db9502816c282dd4f645`；构建摘要：`0xf48637de6a1c988b92d21347662b724b1ee7d59b09f66aaca9c7fe81b9a3b9ce`。

本次修改网页与后台接入，不改变 Solidity、既有合约地址或编译产物。发布候选通过隔离检查，不等于用户已完成主网资金流程。主网只读检查时工厂池数为 **0**；第一笔建池须由用户连接运营钱包并自行确认。

## 同源服务与配置

| 公共路径 | 实际服务 | 用途 |
|---|---|---|
| `/bemine/` | Next 静态导出 | 朋友主页与实际业务界面 |
| `/bemine/data/frontend-manifest.json` | 已核验公开清单 | 固定部署地址与代码摘要 |
| `/bemine/api/journal/*` | `127.0.0.1:4173/api/journal/*` | 钱包登录、持久化意图、签名许可与回执恢复 |
| `/bemine/api/rpc` | `127.0.0.1:4173/api/rpc` | 有方法白名单的只读 RPC |
| `/bemine/api/chain-index/*` | `127.0.0.1:4173/api/chain-index/*` → `127.0.0.1:4180/*` | 矿池、订单和活动索引 |
| `/pinkuang-deploy/` | 原部署台 | 保留已完成部署及恢复记录 |

Nginx 只代理以上前缀，避免占用芯火夺宝原站 `/api`。BEMine 日志响应的 Cookie Path 从 `/api/journal` 重写为 `/bemine/api/journal`；部署台保留原前缀的 Cookie 重写。后台继续验证精确同源 Origin，不增加通配 CORS。

主服务使用 Node.js 24、Linux 私有持久目录；启动真实发布目录的 `server/index.mjs`。索引器为独立服务，启动 `server/chain-index/server.mjs`，只监听 loopback。前端构建指定 `NEXT_PUBLIC_BASE_PATH=/bemine`。

| 环境变量 | 要求 |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `127.0.0.1` / `4173` |
| `DEPLOYMENT_JOURNAL_ORIGIN` | `https://tapeout.cc.cd`，不含路径 |
| `DEPLOYMENT_JOURNAL_DB` | 持久 SQLite 文件；父目录权限 0700，服务账户可读写 |
| `DEPLOYMENT_JOURNAL_RPC_URL` | 已核验 chainId 的 HTTPS BSC RPC |
| `BEMINE_JOURNAL_FACTORIES` | 本次 Factory 地址 |
| `BEMINE_DEPLOYMENT_RECORD_PATH` | 服务端私有、完整、已完成的可信部署记录路径 |
| `BEMINE_READ_RPC_URL` | 固定只读 RPC；未设时沿用日志 RPC |
| `BEMINE_INDEX_URL` | `http://127.0.0.1:4180` |
| `CHAIN_INDEX_RPC_URL` | 支持历史 `eth_getLogs` 的已验证 HTTPS BSC RPC |
| `CHAIN_INDEX_DB` | 独立持久索引数据库 |
| `CHAIN_INDEX_FACTORY` / `CHAIN_INDEX_MARKET` | 上述 Factory / ShareMarket |
| `CHAIN_INDEX_START_BLOCK` | `124286242` |
| `CHAIN_INDEX_CONFIRMATIONS` | `12` |
| `CHAIN_INDEX_HOST` / `CHAIN_INDEX_PORT` | `127.0.0.1` / `4180` |

可信记录从服务器已有完成日志导出，经只读核验后放入私有运维目录，再配置服务路径。文件须包含 13 个已确认步骤、初始化回执、完整地址与运行代码摘要、通过的检查及匹配当前产物的 artifactDigest。不能使用浏览器任意提交的记录代替，也不能只填一个工厂地址放行；运行账户须能读取该私有文件。公开清单与私有记录分开保存。

每次产品签名前，服务端在固定区块检查编译运行代码、库链接、实现槽、工厂与市场关系、运营权限、时间锁角色，随后检查 nonce、Gas、余额及精确调用模拟。索引未追平、RPC 超时或上游报错应显示数据不可用，不得解释为没有资产。

## 交易记录规则

产品沿用 `/api/journal/market`，记录版本为 `2`，固定目标、操作、calldata、金额、nonce、Gas 上限和 Gas 单价。先持久化，再通过 `/market/arm` 取得一次性许可，之后才请求钱包签名。

`arm` 与 `/market/abandon` 使用数据库事务和 revision 检查：同一意图只能取得一次签名许可；只有从未取得许可且没有发送、恢复或取消历史的准备记录可以清除。丢失许可响应、拒签、发送结果不明均不能靠超时推断可重发。

配置正式 BEMine 可信部署后，旧部署台市场不再接受新建无哈希的 v1 签名意图，提示从产品页面操作。已有 v1 记录及带哈希的历史恢复保留。产品和部署共享同一钱包交易通道；未完成部署阻断新增产品签名，已完成 13/13 部署不再占用业务通道。

业务交易继续按实际外层目标、calldata、金额及最终回执核对；初始化交易的中转兼容不扩展为任意业务交易许可。建池成功还须核对唯一 `PoolCreated` 事件，才返回新 `poolAddress`。

## 验证结果与复现

| 检查 | 结果 | 证明范围 |
|---|---|---|
| Linux 后台回归 | 81/81 | 包含日志恢复、并发许可、可信图、代理及索引基础用例 |
| 索引专项复跑 | 10/10 | 索引行为；不与上述重叠用例重复累计 |
| 前端脚本回归 | 108/108 | 当前前端读取、构造调用、交互状态与保护逻辑 |
| 本机 Anvil 资金回路 | 2/2 | 实际本机 EVM 执行：未满额撤回提现、募集超时退款提现 |
| 主网只读图检查 | 通过，区块 `124292027` | 本次既有地址、代码、实现关系与运营绑定 |

本机资金回路使用当前前端 calldata 构造器与 `productGasLimit`。曾确定性复现旧 `estimate × 120%` 策略在跨时间戳撤回时 Gas 不足；当前采用 `max(ceil(estimate × 120%), estimate + 100000)` 后回归通过，同时保留费用预算及后台最新估算检查。失败记录保留，没有改 Solidity 或跳过失败检查。

完整开发目录安装锁定依赖后，可在 Linux / Node.js 24 复现后台与前端脚本：

```sh
cd deploy
node --test $(find server -name '*.test.mjs' ! -name artifact-digest.test.mjs -print)
node --test server/chain-index/indexer.test.mjs
node --test server/artifact-digest.test.mjs
cd ../web
node --test scripts/*.test.mjs
node scripts/sync-contracts.mjs --check
NEXT_PUBLIC_BASE_PATH=/bemine pnpm exec next build
```

独立产物编译测试需要完整开发依赖，不能只在精简生产包中运行。Windows 不用于宣称通过 Linux 私有目录权限验收。

本机资金回路脚本和证据位于工作区 `outputs/pinkuang-deployment-200e544/product-live/`。在本次隔离源码根目录的 PowerShell 中复现：

```powershell
& .\deploy\node_modules\.bin\tsx.cmd --test 'C:\Users\Administrator\Documents\流片上链条\outputs\pinkuang-deployment-200e544\product-live\local-business-e2e.mts'
```

脚本顶部为本机绝对路径，迁移机器须先修改源码、依赖与输出路径。它只启动 `127.0.0.1` 的临时 Anvil，使用解锁测试账户，无主网 RPC 或 fork；chainId 56 只用于测试网络守卫。外部矿机、挖矿与市场地址使用本机占位代码，因此 **不证明真实采购、NFT 交割、挖矿、收益或市场结算完成**，也不覆盖真实钱包弹窗。

证据包括 `backend-tests-final.txt`、`mainnet-graph-check.json`、`local-business-e2e-result.json`、`withdrawDeposit-revert-trace.json`、`本机业务回归与Gas诊断.md`。最终公开服务是否已切换到这一构建，以发布后的页面、清单及服务验收为准。

## 用户首轮主网测试顺序

1. 打开产品页，连接运营钱包并确认 BSC 主网，在「运营工作台」建立测试矿池。核对矿机系列、编号、募集金额、购机上限及截止时间，预览后由用户确认钱包交易；记录新矿池地址和交易哈希。
2. 打开该矿池认购。首轮保持**全池未售满 100 份**，验证资金尚处募集状态，记录钱包确认金额和份额。
3. 在该项目执行「撤回本次项目认购」。确认份额归零、本金进入待领取 BNB；这一步不会直接把本金转回钱包。
4. 执行提现 BNB。确认待领余额归零，钱包收到对应本金；余额对比应单独计入 Gas 支出。
5. 另测募集超时退款时，等待真实链上截止时间，再执行「开启到期退款」和提现；不能提前改时间或把页面倒计时结束当作链上退款成功。

全池认购达到 100 份后的采购单独测试，不混入这轮可撤回流程。采购、实际 NFT 状态、收益归集与领取、份额成交和整机出售需各自验收。

当前已接入运营 `arm/reclaim` 的规范调用，**`start` 所需工作证明尚未接入**。不能据此声称挖矿全流程已经完成，也不提供收益保证。所有主网业务交易均由用户自己在钱包中确认。
