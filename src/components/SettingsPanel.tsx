// Settings Panel Component

export default function SettingsPanel() {
  return (
    <section className="card grid">
      <h2>Settings</h2>
      {/* Add toggles for theme, smoothing, reconnect, etc */}
      <label><input type="checkbox" /> Dark Theme</label>
      <label><input type="checkbox" /> Chart Smoothing</label>
      <label><input type="checkbox" /> Auto-Reconnect</label>
      <button style={{ gridColumn: '1 / -1' }}>Clear All Logs</button>
    </section>
  )
}
