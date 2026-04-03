import { useState, useEffect } from 'react';
import TeamsRail    from './components/TeamsRail';
import TeamsTopBar  from './components/TeamsTopBar';
import Dashboard    from './pages/Dashboard';
import MeetingsPage from './pages/MeetingsPage';
import CalendarPage from './pages/CalendarPage';
import AvailabilityPage from './pages/AvailabilityPage';
import { teamsApi } from './api/teamsApi';

function Spinner({ message }) {
  return (
    <div className="h-screen flex items-center justify-center bg-[#f5f5f5]">
      <div className="text-center">
        <div className="w-10 h-10 border-[3px] border-[#6264A7] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#616161] text-sm">{message}</p>
      </div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#f5f5f5] p-6">
      <div className="bg-white rounded-xl border border-red-200 shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠</div>
        <h2 className="text-base font-semibold text-[#242424] mb-2">Cannot connect to backend</h2>
        <p className="text-[#616161] text-sm mb-4 leading-relaxed">
          The Teams backend (FastAPI) is not running. Start it with:
        </p>
        <div className="bg-[#f5f5f5] rounded-lg px-4 py-3 text-left mb-4">
          <code className="text-xs text-[#6264A7] font-mono leading-relaxed block">
            cd teams-backend<br />
            pip install fastapi uvicorn httpx<br />
            uvicorn app:app --port 3001 --reload
          </code>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-[#6264A7] hover:bg-[#5558A7] text-white py-2 rounded-sm text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [users, setUsers]           = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('calendar');
  const [status, setStatus]         = useState('loading');

  useEffect(() => {
    teamsApi.getUsers()
      .then(d => { setUsers(d.users || []); setActiveUser(d.users?.[0] || null); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return <Spinner message="Connecting to Teams..." />;
  if (status === 'error')   return <ErrorScreen />;

  const switchUser = user => { setActiveUser(user); setCurrentPage('calendar'); };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':    return <Dashboard    activeUser={activeUser} users={users} setCurrentPage={setCurrentPage} />;
      case 'meetings':     return <MeetingsPage activeUser={activeUser} users={users} />;
      case 'availability': return <AvailabilityPage activeUser={activeUser} />;
      default:             return <CalendarPage  activeUser={activeUser} users={users} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <TeamsRail
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        activeUser={activeUser}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TeamsTopBar
          activeUser={activeUser}
          users={users}
          setActiveUser={switchUser}
        />
        <main className="flex-1 overflow-hidden">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
