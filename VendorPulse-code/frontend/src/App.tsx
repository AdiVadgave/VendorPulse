import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import CycleDetail from './pages/CycleDetail'
import Analytics from './pages/Analytics'
import AdminUsers from './pages/AdminUsers'
import NotFound from './pages/NotFound'
import ScorecardForm from './pages/ScorecardForm'
import CalendarTest from './pages/CalendarTest'
// ...

export default function App() {
  return (
    <Routes>
      {/* Standalone scorecard form — reached via emailed link, no app chrome.
          In production this route is isolated from the main application. */}
      <Route path="/scorecard" element={<ScorecardForm />} />

      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="/cycles/:cycleId" element={<CycleDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/calendar-test" element={<CalendarTest />} />
        <Route path="/directory" element={<AdminUsers />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
