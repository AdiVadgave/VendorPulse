import StatusBadge from './StatusBadge';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MeetingCard({ meeting, currentUserId, users, onAccept, onDecline, compact = false }) {
  const organizer = users.find(u => u.userId === meeting.organizerId);
  const myParticipant = meeting.participants.find(p => p.userId === currentUserId);
  const myStatus = myParticipant?.status;
  const isOrganizer = meeting.organizerId === currentUserId;
  const isPast = new Date(meeting.timeSlot.date) < new Date(new Date().toDateString());
  const acceptedCount = meeting.participants.filter(p => p.status === 'accepted').length;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden ${isPast ? 'opacity-60' : ''}`}>
      {/* Top accent bar */}
      <div className={`h-1 ${isOrganizer ? 'bg-indigo-500' : myStatus === 'accepted' ? 'bg-emerald-400' : myStatus === 'declined' ? 'bg-red-400' : 'bg-amber-400'}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm leading-tight">{meeting.title}</h3>
            {meeting.description && !compact && (
              <p className="text-gray-500 text-xs mt-1 line-clamp-2">{meeting.description}</p>
            )}
          </div>
          <div className="shrink-0">
            {isOrganizer ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                ✦ Organizer
              </span>
            ) : myStatus ? (
              <StatusBadge status={myStatus} />
            ) : null}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            📅 {formatDate(meeting.timeSlot.date)}
          </span>
          <span className="flex items-center gap-1">
            🕐 {meeting.timeSlot.startTime}–{meeting.timeSlot.endTime}
          </span>
          <span className="flex items-center gap-1">
            👥 {acceptedCount}/{meeting.participants.length} confirmed
          </span>
        </div>

        {/* Participant avatars */}
        {!compact && (
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {meeting.participants.map(p => {
              const user = users.find(u => u.userId === p.userId);
              if (!user) return null;
              const ringColor = p.status === 'accepted' ? 'ring-emerald-300 bg-emerald-500'
                : p.status === 'declined' ? 'ring-red-200 bg-red-400'
                : 'ring-amber-200 bg-amber-400';
              return (
                <div
                  key={p.userId}
                  title={`${user.name} — ${p.status}`}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ring-2 ${ringColor}`}
                >
                  {user.avatar}
                </div>
              );
            })}
          </div>
        )}

        {/* Organizer note */}
        {organizer && !isOrganizer && !compact && (
          <p className="text-xs text-gray-400 mb-3">Organized by {organizer.name}</p>
        )}

        {/* Accept / Decline actions */}
        {!isOrganizer && myStatus === 'pending' && (onAccept || onDecline) && (
          <div className="flex gap-2 pt-3 border-t border-gray-100">
            {onAccept && (
              <button
                onClick={() => onAccept(meeting.meetingId)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
              >
                ✓ Accept
              </button>
            )}
            {onDecline && (
              <button
                onClick={() => onDecline(meeting.meetingId)}
                className="flex-1 bg-white hover:bg-red-50 text-red-600 text-xs font-medium py-2 px-3 rounded-lg border border-red-200 transition-colors"
              >
                ✗ Decline
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
