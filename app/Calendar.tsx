"use client"

import { useState } from "react"

interface CalendarProps {
  availableDates: string[]  // e.g. ["2026-07-18", "2026-07-17"]
  selectedDate: string
}

export default function Calendar({ availableDates, selectedDate }: CalendarProps) {
  const dateSet = new Set(availableDates)
  const today = new Date()

  // 解析 selectedDate 确定初始展示月份
  const [year, setYear] = useState(() => {
    if (selectedDate) return parseInt(selectedDate.slice(0, 4))
    return today.getFullYear()
  })
  const [month, setMonth] = useState(() => {
    if (selectedDate) return parseInt(selectedDate.slice(5, 7)) - 1
    return today.getMonth()
  })

  const [open, setOpen] = useState(false)

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const formatDate = (d: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
          borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", gap: 6
        }}
      >
        📅 选择日期
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 10,
            background: "#1e293b", borderRadius: 12, padding: 16,
            border: "1px solid #334155", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            minWidth: 280
          }}>
            {/* Month nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button onClick={prevMonth} style={navBtnStyle}>◀</button>
              <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 15 }}>
                {year}年{month + 1}月
              </span>
              <button onClick={nextMonth} style={navBtnStyle}>▶</button>
            </div>

            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {["日","一","二","三","四","五","六"].map(w => (
                <div key={w} style={{ textAlign: "center", fontSize: 11, color: "#64748b", padding: "4px 0" }}>{w}</div>
              ))}
            </div>

            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />
                const dateStr = formatDate(d)
                const hasData = dateSet.has(dateStr)
                const isToday = dateStr === today.toISOString().slice(0, 10)
                const isSelected = dateStr === selectedDate

                return (
                  <a
                    key={d}
                    href={`?date=${dateStr}`}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      height: 36, borderRadius: 8, fontSize: 13, fontWeight: isSelected || isToday ? 600 : 400,
                      textDecoration: "none", cursor: hasData ? "pointer" : "default",
                      background: isSelected ? "#3b82f6"
                        : hasData ? "#1e3a5f"
                        : "transparent",
                      color: isSelected ? "#fff"
                        : hasData ? "#60a5fa"
                        : isToday ? "#f59e0b"
                        : "#475569",
                      border: isToday && !isSelected ? "1px solid #f59e0b" : "1px solid transparent",
                      opacity: hasData ? 1 : 0.4,
                    }}
                  >
                    {d}
                  </a>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#64748b", justifyContent: "center" }}>
              <span>🔵 有数据</span>
              <span>🟡 今天</span>
              <span>⚪ 无数据</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#94a3b8",
  cursor: "pointer", fontSize: 14, padding: "4px 10px", borderRadius: 6
}
