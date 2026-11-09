import { Routes, Route, useParams } from 'react-router'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import CycleDetail from './pages/CycleDetail'
import Analytics from './pages/Analytics'
import AdminUsers from './pages/AdminUsers'
import NotFound from './pages/NotFound'
import ScorecardForm from './pages/ScorecardForm'

/** A fresh CycleDetail per cycle. Without the key, moving between cycles in the sidebar
 *  reused one instance, and the previous cycle's roster, minutes, Teams link and event
 *  id stayed on screen wherever the new cycle had none of its own. */
function CycleDetailRoute() {
  const { cycleId } = useParams<{ cycleId: string }>()
  return <CycleDetail key={cycleId} />
}

export default function App() {
  return (
    <Routes>
      {/* Standalone scorecard form — reached via emailed link, no app chrome.
          In production this route is isolated from the main application. */}
      <Route path="/scorecard" element={<ScorecardForm />} />

      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="/cycles/:cycleId" element={<CycleDetailRoute />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/directory" element={<AdminUsers />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
