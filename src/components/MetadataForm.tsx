import { useState, useCallback } from 'react'
import { validationService, getValidationErrorMessage } from '../services/validation'
import '../styles/forms.css'

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

  // Backend validation function
  const validateField = useCallback(async (field: string, value: string): Promise<string | null> => {
    try {
      switch (field) {
        case 'sessionName':
          await validationService.validateSessionName(value)
          return null
        case 'subjectId':
          await validationService.validateSubjectId(value)
          return null
        case 'notes':
          await validationService.validateNotes(value)
          return null
        default:
          return null
      }
    } catch (error) {
      return getValidationErrorMessage(error)
    }
  }, [])

  // Handle field changes with async validation
  const handleFieldChange = async (field: string, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
    
    // Validate if field has been touched
    if (touched[field as keyof typeof touched]) {
      const error = await validateField(field, value)
      setErrors(prev => ({ ...prev, [field]: error }))
    }
  }

  // Handle field blur (mark as touched and validate)
  const handleFieldBlur = async (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const value = metadata[field as keyof typeof metadata] as string
    const error = await validateField(field, value)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all fields using backend validation
    try {
      const [sessionNameError, subjectIdError, notesError] = await Promise.all([
        validateField('sessionName', metadata.sessionName),
        validateField('subjectId', metadata.subjectId),
        validateField('notes', metadata.notes)
      ])
      
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
    } catch (error) {
      console.error('Validation failed:', error)
      // Show general error message
      setErrors({
        sessionName: 'Validation failed. Please check your input.',
        subjectId: null,
        notes: null
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
