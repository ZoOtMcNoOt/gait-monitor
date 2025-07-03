import { useEffect, useState } from 'react'
import { openDB } from 'idb'
import type { LegacySession } from '../types'

export default function LogsTable() {
  const [logs, setLogs] = useState<LegacySession[]>([])

  useEffect(() => {
    (async () => {
      const db = await openDB('gait-monitor', 1, {
        upgrade(db) {
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
        }
      })
      const all = await db.getAll('sessions')
      setLogs(all)
    })()
  }, [])

  return (
    <section className="card">
      <h2>Saved Sessions</h2>
      <table>
        <thead><tr><th>Date</th><th>User</th><th>Points</th><th>Download</th></tr></thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.date).toLocaleString()}</td>
              <td>{log.meta.name}</td>
              <td>{log.data.length}</td>
              <td>
                <button onClick={() => {
                  const blob = new Blob([log.csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `session-${log.id}.csv`
                  a.click()
                }}>CSV</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
