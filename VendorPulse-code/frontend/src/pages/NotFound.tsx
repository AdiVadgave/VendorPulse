import { useNavigate } from 'react-router-dom'
import { Home, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mb-5">
        <AlertTriangle size={28} className="text-amber-500" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        Page not found
      </h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-6">
        The page you are looking for does not exist or may have been moved.
      </p>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Home size={16} />
        Back to Dashboard
      </button>
    </div>
  )
}
