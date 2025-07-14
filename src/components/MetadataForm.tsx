import { useState } from 'react'
import '../styles/forms.css'

// Input validation utilities
const validateSessionName = (name: string): string | null => {
  if (!name.trim()) return 'Session name is required'
  if (name.length < 3) return 'Session name must be at least 3 characters'
  if (name.length > 100) return 'Session name must be less than 100 characters'
  if (!/^[a-zA-Z0-9\s\-_.]+$/.test(name)) return 'Session name contains invalid characters'
  return null
}

const validateSubjectId = (id: string): string | null => {
  if (!id.trim()) return 'Subject ID is required'
  if (id.length < 2) return 'Subject ID must be at least 2 characters'
  if (id.length > 50) return 'Subject ID must be less than 50 characters'
  if (!/^[a-zA-Z0-9\-_]+$/.test(id)) return 'Subject ID can only contain letters, numbers, hyphens, and underscores'
  return null
}

const validateNotes = (notes: string): string | null => {
  if (notes.length > 1000) return 'Notes must be less than 1000 characters'
  return null
}

interface Props {
  onSubmit?: (metadata: { sessionName: string; subjectId: string; notes: string }) => void
}

export default function MetadataForm({ onSubmit }: Props) {
  const [metadata, setMetadata] = useState({ 
    sessionName: '', 
    subjectId: '', 
    notes: ''
  })

  // Validation state
  const [errors, setErrors] = useState<{
    sessionName?: string | null;
    subjectId?: string | null;
    notes?: string | null;
  }>({})
  
  const [touched, setTouched] = useState<{
    sessionName?: boolean;
    subjectId?: boolean;
    notes?: boolean;
  }>({})

  // Validate individual fields
  const validateField = (field: string, value: string) => {
    switch (field) {
      case 'sessionName':
        return validateSessionName(value)
      case 'subjectId':
        return validateSubjectId(value)
      case 'notes':
        return validateNotes(value)
      default:
        return null
    }
  }

  // Handle field changes with validation
  const handleFieldChange = (field: string, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
    
    // Validate if field has been touched
    if (touched[field as keyof typeof touched]) {
      const error = validateField(field, value)
      setErrors(prev => ({ ...prev, [field]: error }))
    }
  }

  // Handle field blur (mark as touched and validate)
  const handleFieldBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const value = metadata[field as keyof typeof metadata] as string
    const error = validateField(field, value)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all fields
    const sessionNameError = validateSessionName(metadata.sessionName)
    const subjectIdError = validateSubjectId(metadata.subjectId)
    const notesError = validateNotes(metadata.notes)
    
    const validationErrors = {
      sessionName: sessionNameError,
      subjectId: subjectIdError,
      notes: notesError,
    }
    
    setErrors(validationErrors)
    setTouched({ sessionName: true, subjectId: true, notes: true })
    
    // Check if there are any errors
    const hasErrors = Object.values(validationErrors).some(error => error !== null)
    
    if (!hasErrors && onSubmit) {
      onSubmit({
        sessionName: metadata.sessionName.trim(),
        subjectId: metadata.subjectId.trim(),
        notes: metadata.notes.trim()
      })
    }
  }

  return (
    <>
      <style>{`
        .error {
          border-color: #e74c3c !important;
          background-color: #fdf2f2 !important;
        }
        .error-message {
          color: #e74c3c;
          font-size: 0.875rem;
          margin-top: 0.25rem;
          display: block;
        }
      `}</style>
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
            onChange={e => handleFieldChange('sessionName', e.target.value)}
            onBlur={() => handleFieldBlur('sessionName')}
            required
            className={errors.sessionName ? 'error' : ''}
          />
          {errors.sessionName && <span className="error-message">{errors.sessionName}</span>}
        </div>
        
        <div className="form-group">
          <label htmlFor="subjectId">Subject ID *</label>
          <input 
            id="subjectId"
            type="text"
            placeholder="e.g., SUBJ001"
            value={metadata.subjectId} 
            onChange={e => handleFieldChange('subjectId', e.target.value)}
            onBlur={() => handleFieldBlur('subjectId')}
            required
            className={errors.subjectId ? 'error' : ''}
          />
          {errors.subjectId && <span className="error-message">{errors.subjectId}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea 
            id="notes"
            placeholder="Additional notes about this session..."
            value={metadata.notes} 
            onChange={e => handleFieldChange('notes', e.target.value)}
            onBlur={() => handleFieldBlur('notes')}
            rows={3}
            className={errors.notes ? 'error' : ''}
          />
          {errors.notes && <span className="error-message">{errors.notes}</span>}
        </div>

        {onSubmit && (
          <button type="submit" className="btn-primary">
            Continue to Data Collection
          </button>
        )}
      </form>
    </section>
    </>
  )
}
