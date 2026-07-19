import fs from "fs"
import path from "path"
import Calendar from "./Calendar"

const DATA_DIR = path.join(process.cwd(), "data")
const SENTIMENT_MAP: Record<string, { icon: string; label: string; color: string }> = {
  bullish: { icon: "🟢", label: "看多", color: "#22c55e" },
  bearish: { icon: "🔴", label: "看空", color: "#ef4444" },
  neutral: { icon: "⚪", label: "中性", color: "#94a3b8" },
}

interface Post {
  author: string; source: string; title: string; content: string
  url: string; created_at: string
  is_finance: boolean; sentiment: string; targets: string[]; summary: string
}

interface DayData {
  updated: string; period: string; date: string; is_trading_day: boolean
  total: number; finance_count: number; bullish_count: number; bearish_count: number
  posts: Post[]
}

function formatTime(iso: string): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return iso }
}

function getAvailableDates(): string[] {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf-8")
    return JSON.parse(raw).dates || []
  } catch { return [] }
}

function loadDayData(dateStr: string): DayData | null {
  // 防止路径穿越攻击：仅允许 YYYY-MM-DD 格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  try {
    const fp = path.join(DATA_DIR, `${dateStr}.json`)
    if (!fs.existsSync(fp)) return null
    return JSON.parse(fs.readFileSync(fp, "utf-8"))
  } catch { return null }
}

function getLatestDate(): string {
  const dates = getAvailableDates()
  return dates[0] || ""
}

export default function Home({ searchParams }: { searchParams: { date?: string } }) {
  const dates = getAvailableDates()
  const latestDate = getLatestDate()
  const selectedDate = searchParams.date || latestDate
  const data = loadDayData(selectedDate)

  if (!data && dates.length > 0) {
    // 如果选中的日期没有数据，回退到最新日期
    const fallback = loadDayData(latestDate)
    if (fallback) return renderPage(latestDate, dates, fallback)
  }

  return renderPage(selectedDate, dates, data)
}

function renderPage(selectedDate: string, dates: string[], data: DayData | null) {
  const posts = data?.posts || []
  const financePosts = posts.filter(p => p.is_finance)

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 40px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "24px 0 12px" }}>
        <h1 style={{ fontSize: 28, margin: 0, color: "#f8fafc" }}>📊 大佬发言追踪</h1>
      </div>

      {/* 日期选择器 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 0" }}>
        <Calendar availableDates={dates} selectedDate={selectedDate} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {dates.slice(0, 5).map(d => (
            <a key={d} href={`?date=${d}`} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 12, textDecoration: "none",
              background: d === selectedDate ? "#3b82f6" : "#1e293b",
              color: d === selectedDate ? "#fff" : "#94a3b8",
            }}>
              {d.slice(5)}
            </a>
          ))}
        </div>
      </div>

      {/* 无数据 */}
      {!data && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b", background: "#1e293b", borderRadius: 12, margin: "16px 0" }}>
          📭 暂无发言记录<br />
          <span style={{ fontSize: 13 }}>
            系统将在交易日 8:50 / 12:50 自动抓取
          </span>
        </div>
      )}

      {/* 数据展示 */}
      {data && (
        <>
          <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, margin: "4px 0 8px" }}>
            {data.period} · 更新于 {formatTime(data.updated)}
          </p>

          {/* 统计卡片 */}
          <div style={{ display: "flex", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
            <StatCard label="总发言" value={data.total} color="#3b82f6" />
            <StatCard label="财经相关" value={data.finance_count} color="#f59e0b" />
            <StatCard label="🟢 看多" value={data.bullish_count} color="#22c55e" />
            <StatCard label="🔴 看空" value={data.bearish_count} color="#ef4444" />
          </div>

          {/* 发言列表 */}
          {financePosts.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#64748b", background: "#1e293b", borderRadius: 12 }}>
              📭 当日无财经相关发言
            </div>
          )}

          {financePosts.map((post, i) => {
            const s = SENTIMENT_MAP[post.sentiment] || SENTIMENT_MAP.neutral
            return (
              <div key={i} style={{
                background: "#1e293b", borderRadius: 12, padding: "14px 18px",
                margin: "10px 0", borderLeft: `4px solid ${s.color}`
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{post.author}</span>
                  <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: post.source === "zhihu" ? "#1d4ed8" : "#1da1f2", color: "#fff" }}>
                    {post.source === "zhihu" ? "知乎" : "X"}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>{formatTime(post.created_at)}</span>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: s.color, fontWeight: 600 }}>{s.icon} {s.label}</span>
                  {post.targets?.length > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: "#94a3b8" }}>→ {post.targets.join(" · ")}</span>}
                </div>
                {post.summary && <p style={{ margin: "4px 0", fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>💡 {post.summary}</p>}
                {post.content && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
                    {post.content}
                  </p>
                )}
                {post.url && /^https?:\/\//i.test(post.url) && (
                  <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                    🔗 查看原文 →
                  </a>
                )}
              </div>
            )
          })}
        </>
      )}

      <div style={{ textAlign: "center", marginTop: 32, padding: 12, color: "#475569", fontSize: 12 }}>
        交易日 8:50 / 12:50 自动更新 · Powered by DeepSeek AI
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 75, textAlign: "center", background: "#1e293b", borderRadius: 10, padding: "10px 6px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value || 0}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  )
}
