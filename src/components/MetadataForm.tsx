import { useState } from 'react'

interface Props {
  onSubmit?: (metadata: { sessionName: string; subjectId: string; notes: string }) => void
}

export default function MetadataForm({ onSubmit }: Props) {
  const [metadata, setMetadata] = useState({ 
    sessionName: '', 
    subjectId: '', 
    notes: '',
    // Legacy fields for compatibility
    name: '', 
    age: '', 
    weight: '', 
    height: '' 
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSubmit) {
      onSubmit({
        sessionName: metadata.sessionName,
        subjectId: metadata.subjectId,
        notes: metadata.notes
      })
    }
  }

  return (
    <section className="card">
      <h2>Session Metadata</h2>
      <form onSubmit={handleSubmit} className="metadata-form">
        <div className="form-group">
          <label htmlFor="sessionName">Session Name *</label>
          <input 
            id="sessionName"
            type="text"
            placeholder="e.g., Morning Walk Test"
            value={metadata.sessionName} 
            onChange={e => setMetadata({...metadata, sessionName: e.target.value})}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="subjectId">Subject ID *</label>
          <input 
            id="subjectId"
            type="text"
            placeholder="e.g., SUBJ001"
            value={metadata.subjectId} 
            onChange={e => setMetadata({...metadata, subjectId: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea 
            id="notes"
            placeholder="Additional notes about this session..."
            value={metadata.notes} 
            onChange={e => setMetadata({...metadata, notes: e.target.value})}
            rows={3}
          />
        </div>

        {/* Legacy fields - can be shown/hidden based on needs */}
        <details className="legacy-fields">
          <summary>Additional Subject Information</summary>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input 
                id="name"
                type="text"
                placeholder="Name" 
                value={metadata.name} 
                onChange={e => setMetadata({...metadata, name: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input 
                id="age"
                type="number"
                placeholder="Age" 
                value={metadata.age} 
                onChange={e => setMetadata({...metadata, age: e.target.value})}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="weight">Weight (kg)</label>
              <input 
                id="weight"
                type="number"
                placeholder="Weight" 
                value={metadata.weight} 
                onChange={e => setMetadata({...metadata, weight: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label htmlFor="height">Height (cm)</label>
              <input 
                id="height"
                type="number"
                placeholder="Height" 
                value={metadata.height} 
                onChange={e => setMetadata({...metadata, height: e.target.value})}
              />
            </div>
          </div>
        </details>

        {onSubmit && (
          <button type="submit" className="btn-primary">
            Continue to Data Collection
          </button>
        )}
      </form>
    </section>
  )
}
