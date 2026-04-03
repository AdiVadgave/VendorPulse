const STATUS_CONFIG = {
  accepted:  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500',  label: 'Accepted'  },
  pending:   { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',    label: 'Pending'   },
  declined:  { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',      label: 'Declined'  },
  scheduled: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',     label: 'Scheduled' },
  cancelled: { bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400',     label: 'Cancelled' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}
