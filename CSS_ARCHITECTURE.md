# CSS Architecture Documentation

## Overview
The application's CSS has been refactored into a modular, component-specific structure for better maintainability and organization.

## CSS File Structure

### Core Styles
- `globals.css` - Base variables, layout, buttons, and core utilities
- `main.tsx` imports this globally

### Component-Specific Styles

#### 1. Toast Notifications
- **File**: `toast.css`
- **Used by**: `ToastContext.tsx`
- **Contains**: Toast container, notification styling, animations, type-specific colors

#### 2. Sidebar Navigation
- **File**: `sidebar.css`
- **Used by**: `Sidebar.tsx`
- **Contains**: Main sidebar, collection sidebar, scrollbar customization, responsive adjustments

#### 3. Chart Components
- **File**: `chart.css`
- **Used by**: `LiveChart.tsx`
- **Contains**: Chart containers, status indicators, mode selectors, chart controls

#### 4. Modal Dialogs
- **File**: `modal.css`
- **Used by**: 
  - `DataViewer.tsx` (data viewer modal)
  - `ConfirmationModal.tsx` (confirmation dialogs)
  - `CollectTab.tsx` (stop collection modal)
- **Contains**: Modal overlays, data viewer, confirmation dialogs, CollectTab-specific modals

#### 5. Form Components
- **File**: `forms.css`
- **Used by**: `MetadataForm.tsx`
- **Contains**: Form groups, input styling, validation states, legacy fields, responsive forms

#### 6. Table Components
- **File**: `tables.css`
- **Used by**: `LogsTab.tsx`, `DataViewer.tsx`
- **Contains**: Base tables, stats grids, logs table, empty states, responsive table adjustments

#### 7. Settings Components
- **File**: `settings.css`
- **Used by**: `SettingsTab.tsx`
- **Contains**: Settings grid, toggle switches, path inputs, settings actions, responsive settings

#### 8. Tab Content
- **File**: `tabs.css`
- **Used by**: All tab components (`ConnectTab.tsx`, `CollectTab.tsx`, `LogsTab.tsx`, `SettingsTab.tsx`)
- **Contains**: Tab content layout, headers, sections, actions, responsive tab adjustments

## Import Strategy

Each component imports only the CSS files it needs:

```tsx
// Example: LogsTab.tsx
import '../styles/tables.css'  // For table styling
import '../styles/tabs.css'    // For tab layout
```

## Benefits

1. **Maintainability**: Easy to find and modify styles for specific components
2. **Performance**: Only load styles that are actually used
3. **Debugging**: Clear separation makes it easier to identify style conflicts
4. **Team Development**: Multiple developers can work on different components without conflicts
5. **Code Splitting**: Better for bundle optimization

## CSS Variables

All files use consistent CSS variables defined in `globals.css`:
- `--color-primary`, `--color-primary-light`
- `--color-bg`, `--color-card-bg`
- `--text-color`, `--text-secondary`
- `--color-border`, `--radius`, `--spacing`
- `--success-color`, `--error-color`

## Responsive Design

Each component file includes its own responsive breakpoints:
- `@media (max-width: 768px)` - Tablet
- `@media (max-width: 480px)` - Mobile

## Browser Compatibility

All files include necessary vendor prefixes:
- `-webkit-backdrop-filter` for Safari support
- Consistent fallbacks for older browsers

## Migration Notes

- Removed duplicate chart styles from `globals.css`
- Consolidated related styles into logical component groups  
- Maintained all existing functionality while improving organization
- No breaking changes to component implementations
