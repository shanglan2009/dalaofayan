import data from "@/data/latest.json"

interface Post {
  author: string
  source: string
  title: string
  content: string
  url: string
  created_at: string
  is_finance: boolean
  sentiment: string
  targets: string[]
  summary: string
}

interface DataFile {
  updated: string
  period: string
  is_trading_day: boolean
  total?: number
  finance_count?: number
  bullish_count?: number
  bearish_count?: number
  posts: Post[]
}

const typed = data as DataFile

const SENTIMENT_MAP: Record<string, { icon: string; label: string; color: string }> = {
  bullish: { icon: "🟢", label: "看多", color: "#22c55e" },
  bearish: { icon: "🔴", label: "看空", color: "#ef4444" },
  neutral: { icon: "⚪", label: "中性", color: "#94a3b8" },
}

function formatTime(iso: string): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

export default function Home() {
  const posts = typed.posts || []
  const financePosts = posts.filter(p => p.is_finance)

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "32px 0 16px" }}>
        <h1 style={{ fontSize: 28, margin: 0, color: "#f8fafc" }}>📊 大佬发言追踪</h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: "8px 0 0" }}>
          {typed.period || "加载中..."} · 更新于 {formatTime(typed.updated) || "—"}
        </p>
      </div>

      {/* 非交易日 */}
      {!typed.is_trading_day && (
        <div style={{
          textAlign: "center", padding: 40, color: "#64748b",
          background: "#1e293b", borderRadius: 12, margin: "16px 0"
        }}>
          🏖️ 今日非交易日，暂无新发言
        </div>
      )}

      {/* 统计卡片 */}
      {typed.is_trading_day && (
        <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
          <StatCard label="总发言" value={typed.total || 0} color="#3b82f6" />
          <StatCard label="财经相关" value={typed.finance_count || 0} color="#f59e0b" />
          <StatCard label="🟢 看多" value={typed.bullish_count || 0} color="#22c55e" />
          <StatCard label="🔴 看空" value={typed.bearish_count || 0} color="#ef4444" />
        </div>
      )}

      {/* 发言列表 */}
      {financePosts.length === 0 && typed.is_trading_day && (
        <div style={{
          textAlign: "center", padding: 40, color: "#64748b",
          background: "#1e293b", borderRadius: 12, margin: "16px 0"
        }}>
          📭 暂无财经相关发言
        </div>
      )}

      {financePosts.map((post, i) => {
        const s = SENTIMENT_MAP[post.sentiment] || SENTIMENT_MAP.neutral
        return (
          <div key={i} style={{
            background: "#1e293b", borderRadius: 12, padding: "16px 20px",
            margin: "12px 0", borderLeft: `4px solid ${s.color}`
          }}>
            {/* 作者 & 来源 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>
                {post.author}
              </span>
              <span style={{
                fontSize: 11, padding: "2px 6px", borderRadius: 4,
                background: post.source === "zhihu" ? "#1d4ed8" : "#1da1f2",
                color: "#fff"
              }}>
                {post.source === "zhihu" ? "知乎" : "X"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
                {formatTime(post.created_at)}
              </span>
            </div>

            {/* 多空标签 */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: s.color, fontWeight: 600 }}>
                {s.icon} {s.label}
              </span>
              {post.targets && post.targets.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 13, color: "#94a3b8" }}>
                  → {post.targets.join(" · ")}
                </span>
              )}
            </div>

            {/* AI 总结 */}
            {post.summary && (
              <p style={{ margin: "6px 0", fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
                💡 {post.summary}
              </p>
            )}

            {/* 原文 */}
            {post.content && (
              <p style={{
                margin: "8px 0 0", fontSize: 13, color: "#64748b",
                lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical"
              } as React.CSSProperties}>
                {post.content}
              </p>
            )}

            {/* 链接 — 仅允许 http/https 协议 */}
            {post.url && /^https?:\/\//i.test(post.url) && (
              <a href={post.url} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-block", marginTop: 8, fontSize: 12, color: "#3b82f6",
                textDecoration: "none"
              }}>
                🔗 查看原文 →
              </a>
            )}
          </div>
        )
      })}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, padding: 16, color: "#475569", fontSize: 12 }}>
        每个交易日 9:00 / 13:00 自动更新 · Powered by DeepSeek AI
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 80, textAlign: "center",
      background: "#1e293b", borderRadius: 10, padding: "12px 8px"
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  )
}
