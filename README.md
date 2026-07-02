# 颜值评价（真人打分）小程序

一个「真人互评颜值」的微信小程序。用户上传照片 → 系统随机推送他人照片 → 5 秒倒计时隐藏 → 用户打分（1-10 分）→ 查看自己的平均分。

**核心玩法：匿名互评 + 悬念感**

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
│   ├── login/                # 用户登录/注册
│   ├── updateProfile/        # 更新性别/推送偏好
│   ├── uploadPhoto/          # 照片记录入库
│   ├── getMyPhoto/           # 获取我的照片
│   ├── deletePhoto/          # 删除照片+评分
│   ├── getNextPhoto/         # 随机获取待评分照片
│   ├── submitRating/         # 提交评分
│   └── getMyRating/          # 获取平均分
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
| `users` | 用户信息（openid、性别、推送偏好） |
| `photos` | 照片记录（云存储fileID、状态） |
| `ratings` | 评分记录（分数、关联照片） |

## 本地调试

1. 微信开发者工具打开项目根目录 `Beautyapp/`
2. 确保已绑定云开发环境
3. 直接编译运行即可

## License

MIT
