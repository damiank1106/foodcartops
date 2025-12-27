# How to Edit "How to Use App" Content

## Location
The "How to Use App" content is located in the following file:
- **File:** `app/boss/how-to-use.tsx`
- **Lines:** 1-350 (approximately)

## Structure
The content is organized as a React Native component with multiple sections, each using:
- `Section` component for major categories
- `Subsection` component for sub-topics
- `BulletPoint` component for individual items

## How to Edit

### 1. Direct File Editing
Open `app/boss/how-to-use.tsx` and modify the JSX content directly.

### 2. Content Organization
The content is structured as follows:

```tsx
<Section title="Section Name" icon={<IconName />}>
  <Subsection title="Subsection Title">
    <BulletPoint text="Main point" />
    <BulletPoint sub text="Sub-point" />
  </Subsection>
</Section>
```

### 3. Current Sections
1. Quick Start
2. Login & Roles
3. Boss Dashboard
4. Users & Workers
5. Products & Categories
6. Expenses Management
7. Worker Functions
8. Inventory Module
9. Data & Storage

### 4. Adding New Sections
To add a new section:
```tsx
<Section title="New Section" icon={<NewIcon size={20} color={theme.primary} />}>
  <Subsection title="New Subsection">
    <BulletPoint text="New content here" />
  </Subsection>
</Section>
```

### 5. Icons Available
Import icons from `lucide-react-native`:
- Users, ShoppingCart, Package, DollarSign, Clock, FileText, BarChart, AlertCircle, BookOpen

## Notes
- The content is displayed in both General Manager and Operation Manager accounts
- Workers see a simplified version in Profile → How to Use App modal
- Changes are immediately visible after app refresh
- No database or external storage is involved - it's all component code
