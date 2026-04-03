import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import CycleDetail from './pages/CycleDetail'
import Analytics from './pages/Analytics'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="/cycles/:cycleId" element={<CycleDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
