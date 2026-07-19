#!/usr/bin/env python3
"""大佬发言抓取与分析 - GitHub Actions 定时任务脚本

由 GitHub Actions 在每个交易日 8:50 和 12:50 (北京时间) 触发。
读取环境变量中的配置，爬取知乎/Twitter 大佬发言，
使用 DeepSeek API 提炼多空观点，输出 JSON 供 Next.js 展示。

环境变量:
  ZHIHU_COOKIE       - 知乎登录 cookie
  DEEPSEEK_API_KEY   - DeepSeek API Key
  GITHUB_TOKEN       - GitHub Token (用于自动 commit & push)
  RUN_MODE           - morning / noon (决定抓取时间范围)
"""
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx
from openai import OpenAI

# ── 配置 ──────────────────────────────────────────────

ZHIHU_COOKIE = os.getenv("ZHIHU_COOKIE", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
RUN_MODE = os.getenv("RUN_MODE", "morning")  # morning | noon

# 知乎用户
ZHIHU_USERS = [
    {"name": "超级大湿", "url_token": "du-wei-51-45"},
    {"name": "deepvan", "url_token": "yang-lei-96-72"},
    {"name": "龙头18868", "url_token": "18868-42"},
]

# Twitter 用户
TWITTER_USERS = [
    {"name": "CCCCC", "username": "BianMian96608"},
    {"name": "擒龙捉妖.泰戈", "username": "sszcw"},
]

OUTPUT_DIR = Path("data")
OUTPUT_FILE = OUTPUT_DIR / "latest.json"

# ── 日志 ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fetch")

# ── 知乎爬虫 ──────────────────────────────────────────

class ZhihuFetcher:
    """知乎用户动态抓取 — 使用 answers / articles / pins 三个端点"""

    API_BASE = "https://www.zhihu.com/api/v4/members/{token}"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-api-version": "3.0.40",
        "Referer": "https://www.zhihu.com/",
    }

    def __init__(self, cookie: str):
        cookies: dict[str, str] = {}
        for item in cookie.split(";"):
            item = item.strip()
            if "=" in item:
                k, _, v = item.partition("=")
                cookies[k.strip()] = v.strip()
        self.client = httpx.Client(
            headers=self.HEADERS, cookies=cookies, timeout=30.0
        )

    def _fetch_endpoint(
        self, url: str, since: datetime, post_type: str, name: str
    ) -> list[dict]:
        """通用端点抓取"""
        posts: list[dict] = []
        offset = 0
        max_pages = 2

        for _ in range(max_pages):
            sep = "&" if "?" in url else "?"
            full_url = f"{url}{sep}limit=10&offset={offset}"
            try:
                resp = self.client.get(full_url)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.warning(f"[知乎] {name} {post_type} 请求失败: {e}")
                break

            items = data.get("data", [])
            if not items:
                break

            for item in items:
                post = self._parse_item(item, name, post_type)
                if post and post["created_at"] > since.isoformat():
                    posts.append(post)

            paging = data.get("paging", {})
            if paging.get("is_end", True):
                break
            offset += len(items)
            time.sleep(0.5)

        return posts

    def fetch_user(self, url_token: str, name: str, since: datetime) -> list[dict]:
        """获取用户动态（回答 + 文章 + 想法）"""
        all_posts: list[dict] = []

        base = self.API_BASE.format(token=url_token)
        endpoints = [
            (f"{base}/answers?sort_by=created", "answer"),
            (f"{base}/articles", "article"),
            (f"{base}/pins", "pin"),
        ]

        for url, ptype in endpoints:
            try:
                posts = self._fetch_endpoint(url, since, ptype, name)
                all_posts.extend(posts)
            except Exception as e:
                logger.error(f"[知乎] {name} {ptype} 抓取出错: {e}")
            time.sleep(0.5)

        logger.info(f"[知乎] {name}: {len(all_posts)} 条")
        return all_posts

    def _parse_item(self, item: dict, name: str, post_type: str) -> Optional[dict]:
        """解析不同端点的条目"""
        ts = item.get("created_time") or item.get("updated_time") or 0
        if ts == 0:
            return None
        created = datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=8)))

        if post_type == "answer":
            q = item.get("question", {})
            title = q.get("title", "")
            content = item.get("excerpt", "")
            pid = item.get("id", "")
            url = f"https://www.zhihu.com/question/{q.get('id','')}/answer/{pid}"
        elif post_type == "article":
            title = item.get("title", "")
            content = item.get("excerpt", "")
            pid = item.get("id", "")
            url = f"https://zhuanlan.zhihu.com/p/{pid}"
        elif post_type == "pin":
            title = ""
            content = ""
            # pins 可能有多块内容
            for block in item.get("content", []):
                if isinstance(block, dict) and block.get("content"):
                    content += block["content"] + "\n"
            content = content.strip()
            pid = item.get("id", "")
            # pin URL
            url = f"https://www.zhihu.com/pin/{pid}"
        else:
            return None

        content = re.sub(r"<[^>]+>", "", content or "").strip()
        title = re.sub(r"<[^>]+>", "", title or "").strip()

        return {
            "author": name,
            "source": "zhihu",
            "title": title,
            "content": content[:500],
            "url": url,
            "created_at": created.isoformat(),
        }


# ── Twitter 抓取 (简易 API) ──────────────────────────

class TwitterFetcher:
    """Twitter 用户推文抓取 - 使用 guest token API"""

    BASE = "https://x.com"

    def __init__(self):
        # Twitter public guest token — can also be overridden via env
        bearer = os.getenv(
            "TWITTER_BEARER_TOKEN",
            "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
            "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        )
        self.client = httpx.Client(
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Authorization": f"Bearer {bearer}",
            },
            timeout=30.0,
        )

    def fetch_user(self, username: str, name: str, since: datetime) -> list[dict]:
        """获取用户推文 - 使用简易方式"""
        try:
            # 获取 guest token
            resp = self.client.post(
                "https://api.x.com/1.1/guest/activate.json"
            )
            guest_token = resp.json().get("guest_token", "")
            if guest_token:
                self.client.headers["x-guest-token"] = guest_token

            # 尝试获取用户推文
            # 注意：此方式成功率有限，如失败会返回空列表
            resp = self.client.get(
                f"{self.BASE}/{username}",
                headers={"Accept": "text/html"},
            )
            if resp.status_code != 200:
                logger.warning(f"[Twitter] {name} 页面访问失败: {resp.status_code}")
                return []

            # 从页面提取推文数据（简单正则匹配）
            # Twitter 页面结构常变，此处做保守处理
            posts: list[dict] = []
            # 匹配 data-testid="tweet" 内的文本和时间
            tweet_pattern = re.findall(
                r'<article[^>]*data-testid="tweet"[^>]*>(.*?)</article>',
                resp.text, re.DOTALL
            )
            for tweet_html in tweet_pattern[:10]:
                text_match = re.search(
                    r'data-testid="tweetText"[^>]*>(.*?)</div>',
                    tweet_html, re.DOTALL
                )
                time_match = re.search(
                    r'<time[^>]*datetime="([^"]+)"',
                    tweet_html
                )
                link_match = re.search(
                    r'href="(/[^/]+/status/\d+)"',
                    tweet_html
                )

                if not text_match:
                    continue
                text = re.sub(r"<[^>]+>", "", text_match.group(1)).strip()
                if not text:
                    continue

                created = None
                if time_match:
                    try:
                        created = datetime.fromisoformat(
                            time_match.group(1).replace("Z", "+00:00")
                        )
                    except ValueError:
                        pass

                if created and created < since:
                    continue

                url = ""
                if link_match:
                    url = f"{self.BASE}{link_match.group(1)}"

                posts.append({
                    "author": name,
                    "source": "twitter",
                    "title": "",
                    "content": text[:500],
                    "url": url,
                    "created_at": created.isoformat() if created else "",
                })

            logger.info(f"[Twitter] {name}: {len(posts)} 条")
            return posts

        except Exception as e:
            logger.warning(f"[Twitter] {name} 抓取失败: {e}")
            return []


# ── DeepSeek AI 提炼 ──────────────────────────────────

SYSTEM_PROMPT = """你是A股市场分析助手。分析财经大V发言，判断是否与股市/财经相关，提炼核心观点。

对每条发言返回JSON（只返回JSON，不要其他文字）：
{"is_finance": true/false, "sentiment": "bullish"|"bearish"|"neutral", "targets": ["标的"], "summary": "30字内总结"}

规则：
- 只有涉及A股/港股/美股、具体股票、板块、经济政策才算财经相关
- 日常生活、娱乐、政治不算
- 明确看多→bullish，明确看空→bearish，无方向→neutral
- targets列出具体股票名/板块名
- 非财经相关的is_finance为false，其余字段填空"""


def analyze_with_deepseek(posts: list[dict]) -> list[dict]:
    """用 DeepSeek API 批量分析"""
    if not posts:
        return []

    if not DEEPSEEK_API_KEY:
        logger.warning("DeepSeek API Key 未配置，跳过 AI 分析")
        return posts

    client = OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )

    results: list[dict] = []
    for post in posts:
        text = f"发言者: {post['author']}\n平台: {post['source']}\n"
        if post.get("title"):
            text += f"标题: {post['title']}\n"
        text += f"内容: {post['content']}\n"
        text += f"时间: {post['created_at']}"

        try:
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                temperature=0.1,
                max_tokens=300,
            )
            raw = resp.choices[0].message.content or "{}"
            # 提取 JSON（支持嵌套）
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            analysis = json.loads(m.group()) if m else {}
        except Exception as e:
            logger.warning(f"DeepSeek 分析失败 ({post['author']}): {e}")
            analysis = {"is_finance": False}

        post["is_finance"] = analysis.get("is_finance", False)
        post["sentiment"] = analysis.get("sentiment", "neutral")
        post["targets"] = analysis.get("targets", [])
        post["summary"] = analysis.get("summary", "")
        results.append(post)

    finance_count = sum(1 for p in results if p.get("is_finance"))
    logger.info(f"DeepSeek 分析: {len(results)} 条 → {finance_count} 条财经相关")
    return results


# ── 主流程 ────────────────────────────────────────────

def get_time_range() -> tuple[datetime, str]:
    """根据 RUN_MODE 确定抓取时间范围"""
    tz = timezone(timedelta(hours=8))  # UTC+8
    now = datetime.now(tz)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if RUN_MODE == "morning":
        # 早间：抓取昨天全天
        yesterday = today - timedelta(days=1)
        return yesterday, f"{yesterday.strftime('%m月%d日')} 全天"
    else:
        # 午间：抓取今天0点到现在的
        return today, f"{today.strftime('%m月%d日')} 上午"


def is_trading_day(d: datetime) -> bool:
    """判断是否为 A 股交易日（简易版：周一到周五）"""
    return d.weekday() < 5


def git_commit_and_push():
    """自动 commit 并 push 数据文件"""
    token = os.getenv("GITHUB_TOKEN", "")
    if not token:
        logger.info("未配置 GITHUB_TOKEN，跳过自动 push")
        return

    import subprocess

    repo = os.getenv("GITHUB_REPOSITORY", "")
    if not repo:
        logger.warning("未检测到 GITHUB_REPOSITORY")
        return

    # 配置 git（认证由 actions/checkout 自动注入，无需手动传 token）
    subprocess.run(["git", "config", "user.name", "dalaofayan-bot"], check=False)
    subprocess.run(["git", "config", "user.email", "bot@dalaofayan.dev"], check=False)

    # commit
    subprocess.run(["git", "add", str(OUTPUT_FILE)], check=False)
    result = subprocess.run(
        ["git", "commit", "-m", f"auto: {RUN_MODE} update {datetime.now().strftime('%m-%d %H:%M')}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        combined = result.stdout + result.stderr
        if "nothing to commit" in combined:
            logger.info("无变更，跳过 push")
        else:
            logger.error(f"Git commit 失败: {result.stderr.strip()[:200]}")
        return

    # push（认证由 actions/checkout 的 persist-credentials 提供）
    result = subprocess.run(["git", "push"], capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"Git push 失败 (code={result.returncode}): {result.stderr.strip()[:200]}")
    else:
        logger.info("已推送到 GitHub")


def main():
    logger.info(f"=== 大佬发言抓取开始 (mode={RUN_MODE}) ===")

    since, period_desc = get_time_range()

    # 检查交易日
    if not is_trading_day(datetime.now(timezone(timedelta(hours=8)))):
        logger.info("今天不是交易日（周末），跳过")
        # 仍然更新 JSON，但标注非交易日
        result = {
            "updated": datetime.now(timezone(timedelta(hours=8))).isoformat(),
            "period": period_desc,
            "is_trading_day": False,
            "posts": [],
            "summary": "今日非交易日，暂无数据",
        }
        OUTPUT_DIR.mkdir(exist_ok=True)
        OUTPUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        git_commit_and_push()
        return

    all_posts: list[dict] = []

    # ── 知乎 ──
    if ZHIHU_COOKIE:
        logger.info("--- 抓取知乎 ---")
        zhihu = ZhihuFetcher(ZHIHU_COOKIE)
        for user in ZHIHU_USERS:
            try:
                posts = zhihu.fetch_user(user["url_token"], user["name"], since)
                all_posts.extend(posts)
            except Exception as e:
                logger.error(f"[知乎] {user['name']} 出错: {e}")
            time.sleep(1)
    else:
        logger.warning("未配置 ZHIHU_COOKIE，跳过知乎")

    # ── Twitter ──
    logger.info("--- 抓取 Twitter ---")
    twitter = TwitterFetcher()
    for user in TWITTER_USERS:
        try:
            posts = twitter.fetch_user(user["username"], user["name"], since)
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"[Twitter] {user['name']} 出错: {e}")
        time.sleep(1)

    logger.info(f"共抓取 {len(all_posts)} 条原始发言")

    # ── DeepSeek AI 提炼 ──
    analyzed = analyze_with_deepseek(all_posts)

    # ── 过滤：只保留财经相关 ──
    finance_posts = [p for p in analyzed if p.get("is_finance")]

    # ── 统计 ──
    bulls = [p for p in finance_posts if p.get("sentiment") == "bullish"]
    bears = [p for p in finance_posts if p.get("sentiment") == "bearish"]

    result = {
        "updated": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "period": period_desc,
        "is_trading_day": True,
        "total": len(all_posts),
        "finance_count": len(finance_posts),
        "bullish_count": len(bulls),
        "bearish_count": len(bears),
        "posts": finance_posts,
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"结果已写入 {OUTPUT_FILE}")

    # ── 自动 Push ──
    git_commit_and_push()

    logger.info("=== 完成 ===")


if __name__ == "__main__":
    main()
