# 颜值评价（真人打分）小程序

一个「真人互评颜值」的微信小程序。用户上传照片 → 系统随机推送他人照片 → 5 秒倒计时隐藏 → 用户打分（1-10 分）→ 查看自己的平均分与全站排名。

**核心玩法：匿名互评 + 悬念感 + 先付出后解锁**

## 解锁规则

| 规则 | 说明 |
|------|------|
| 解锁条件 | 累计给他人打分 **5 次** 后，才能查看自己的分数 |
| 展示内容 | 平均分、打分人数、全站排名（第 N 名 / 共 M 人）、超过百分之多少的用户 |

- 门槛由 `getMyRating` 云函数校验，未满足时不下发任何分数与排名数据（前端无法绕过）。
- 已评价次数写在 `users.ratings_given` 字段，由 `submitRating` 累加，不随照片被删除而减少；
  老用户缺少该字段时，读取时会按实际评分记录统计一次并回填。
- 排名只统计**当前活跃**的照片，同分并列（平均分比我高的人数 + 1）。

---

## 内容安全（用户上传图片检测）

用户上传的照片属于用户发布内容，必须先通过微信内容安全检测才能展示给其他人。

| 环节 | 说明 |
|------|------|
| 检测接口 | `security.mediaCheckAsync`（云调用，v2 异步版） |
| 提交时机 | `uploadPhoto` 云函数入库时立即提交检测 |
| 检测场景 | `media_type: 2`（图片）、`scene: 2`（评论）、`version: 2` |
| 结果接收 | 微信在 30 分钟内推送到「消息接收方」，由 `mediaCheckCallback` 云函数处理 |

照片状态流转（`photos.status`）：

| 状态 | 含义 | 是否对其他人展示 |
|------|------|------------------|
| `checking` | 已提交检测，等待结果 | 否 |
| `approved` | 检测通过 | 是 |
| `rejected` | 未通过（含违规与建议人工复核），文件已删除 | 否 |

- 检测建议 `suggest` 只有 `pass` 才放行，`risky`（违规）和 `review`（建议人工复核）
  一律按未通过处理——本项目没有人工复核环节，避免用户卡在中间状态。
- 检测提交失败的图片**直接回滚删除**，不会入库展示。
- 只有 `approved` 的照片 `is_active = true`，打分页（`getNextPhoto`）只推送 `is_active` 的照片。
- 未通过时小程序内只提示「照片含违规信息」，不展示具体检测标签。

> ⚠️ **必须配置消息推送，否则照片会一直停在「审核中」**
>
> 云开发控制台 → 设置 → 其他设置 → 消息推送 → 推送模式选「云函数」，
> 新增一条配置：**消息类型 `event`、事件类型 `wxa_media_check`**，选择云函数 `mediaCheckCallback`。
> 注意：同一 `<消息类型, 事件类型>` 只能推送到一个云函数；在云函数中配置过的类型
> 不会再推送到小程序后台配置的服务器地址。
>
> 另需 `uploadPhoto` 目录下的 `config.json` 声明云调用权限（已随代码提供）：
> ```json
> { "permissions": { "openapi": ["security.mediaCheckAsync"] } }
> ```
> 权限配置有 10 分钟缓存，刚上传完云函数若报 `-604101`（无权限），等 10 分钟再试。

接口文档：[多媒体内容安全识别 media_check_async](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync)

---

## 配置信息

| 配置项 | 值 |
|--------|-----|
| AppID | `wxa0fb90fa50a32b60` |
| 云开发环境 | `beautyapp-d8g53z50b73ca5621` |
| 后端方案 | 微信云开发（云函数 + 云数据库 + 云存储） |

---

## 项目结构

```
Beautyapp/
├── cloudfunctions/           # 云函数
│   ├── login/                # 用户登录/注册（含已评价次数）
│   ├── updateProfile/        # 更新性别/推送偏好
│   ├── uploadPhoto/          # 照片入库 + 提交内容安全检测
│   ├── mediaCheckCallback/   # 接收内容安全检测结果（消息推送触发）
│   ├── getMyPhoto/           # 获取我的照片（含审核状态）
│   ├── deletePhoto/          # 删除照片+评分（支持任意状态）
│   ├── getNextPhoto/         # 随机获取待评分照片
│   ├── submitRating/         # 提交评分（并累加已评价次数）
│   └── getMyRating/          # 解锁校验 + 平均分 + 全站排名
├── miniprogram/              # 小程序前端
│   ├── app.js                # 入口（云开发初始化 + 隐私协议）
│   ├── app.json              # TabBar 配置
│   ├── app.wxss              # 全局样式
│   ├── pages/
│   │   ├── rating/           # 打分系统（首页）
│   │   └── myphotos/         # 我的照片
│   └── utils/
│       ├── api.js            # 云函数调用封装
│       └── util.js           # 工具函数
└── project.config.json       # 项目配置
```

## 数据库集合

| 集合 | 说明 |
|------|------|
| `users` | 用户信息（openid、性别、推送偏好、`ratings_given` 已评价次数） |
| `photos` | 照片记录（云存储fileID、`status` 审核状态、`is_active`、`check_trace_id` 检测任务id） |
| `ratings` | 评分记录（分数、关联照片） |

## 部署提醒

内容安全改造涉及 **5 个云函数**，需要在微信开发者工具中重新上传部署：

| 云函数 | 变更 |
|--------|------|
| `uploadPhoto` | 入库为审核中 + 提交内容安全检测（新增 `config.json` 声明云调用权限） |
| `mediaCheckCallback` | **新增云函数**，接收检测结果 |
| `getMyPhoto` | 返回照片审核状态 |
| `deletePhoto` | 支持删除审核中/未通过的照片 |
| `getNextPhoto` | 只推送 `is_active` 的照片，无需改动，但需一并确认线上版本已是最新 |

再加上前面解锁与排名改动的 `submitRating`、`getMyRating`、`login`。

**部署后必须自测**：上传一张照片 → 「我的照片」页应显示「照片审核中」→ 几秒到几分钟内变为正常展示。
如果一直停在审核中，说明消息推送没配置成功，详见上文「内容安全」章节。

## 本地调试

1. 微信开发者工具打开项目根目录 `Beautyapp/`
2. 确保已绑定云开发环境
3. 直接编译运行即可

## License

MIT
