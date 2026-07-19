# 📊 大佬发言追踪

自动追踪知乎/X(Twitter)交易大佬发言，DeepSeek AI 提炼多空观点，网页展示。

👉 **演示**：[Vercel 部署后在此查看](https://dalaofayan.vercel.app)

## 追踪的大佬

| 大佬 | 平台 | 主页 |
|------|------|------|
| 超级大湿 | 知乎 | https://www.zhihu.com/people/du-wei-51-45 |
| deepvan | 知乎 | https://www.zhihu.com/people/yang-lei-96-72 |
| 龙头18868 | 知乎 | https://www.zhihu.com/people/18868-42 |
| CCCCC | X/Twitter | https://x.com/BianMian96608 |
| 擒龙捉妖.泰戈 | X/Twitter | https://x.com/sszcw |

## 架构

```
GitHub Actions (每个交易日 8:50 / 12:50)
  ↓ 运行 Python 脚本
  ↓ 爬取知乎 + Twitter 发言
  ↓ DeepSeek API 提炼多空观点
  ↓ 写入 data/latest.json → git push
  ↓
Vercel 检测 push → 自动重新部署
  ↓
网页展示结论 🎉
```

## 一键部署

### 1. Fork 仓库

把本仓库 Fork 到你的 GitHub 账号下。

### 2. 配置 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions → New repository secret：

| Secret | 说明 |
|--------|------|
| `ZHIHU_COOKIE` | 知乎登录 cookie |
| `DEEPSEEK_API_KEY` | DeepSeek API Key ([获取](https://platform.deepseek.com)) |
| `GITHUB_TOKEN` | **自动提供，无需手动配置** |

### 3. 部署到 Vercel

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 登录
2. Import 你的仓库
3. Framework 选 Next.js
4. Deploy！

### 4. 获取知乎 Cookie

1. Chrome 登录 [知乎](https://www.zhihu.com)
2. F12 → Application → Cookies → www.zhihu.com
3. 复制完整 cookie 字符串（需包含 `z_c0`）

### 5. 获取 DeepSeek API Key

1. 注册 [DeepSeek 开放平台](https://platform.deepseek.com)
2. 充值 10 元（可用很久，1元≈100万token）
3. API Keys → 创建 Key

## 本地开发

```bash
npm install
npm run dev        # Next.js 开发服务器
python fetch_and_analyze.py   # 手动运行抓取（需设环境变量）
```

## 数据格式

`data/latest.json`：

```json
{
  "updated": "2024-06-15T12:50:00+08:00",
  "period": "6月15日 上午",
  "is_trading_day": true,
  "total": 5,
  "finance_count": 3,
  "bullish_count": 2,
  "bearish_count": 1,
  "posts": [
    {
      "author": "超级大湿",
      "source": "zhihu",
      "title": "...",
      "content": "...",
      "url": "...",
      "created_at": "...",
      "is_finance": true,
      "sentiment": "bullish",
      "targets": ["新能源", "宁德时代"],
      "summary": "看多新能源，宁德时代目标价500"
    }
  ]
}
```

## 费用

| 服务 | 费用 |
|------|------|
| GitHub Actions | 免费（公有仓库无限） |
| Vercel | 免费（Hobby 计划） |
| DeepSeek API | ~0.01元/次（极其便宜） |
| **总计** | **≈ 0 元/月** |
