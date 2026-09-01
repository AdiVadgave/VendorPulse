/**
 * Typed API functions for the Meeting module (Module E).
 * All calls go through the base apiFetch wrapper.
 */
import { apiFetch } from './api'
import type { MeetingNote, MeetingMinutes } from '@/types/meeting.types'

// ── Response shape ──────────────────────────────────────────────────────────

export interface AgentResponse<T = unknown> {
  status: 'success' | 'failed' | 'partial' | 'pending_approval'
  agent: string
  summary: string
  data: T | null
  warnings: string[]
  next_actions: string[]
  requires_approval: boolean
  run_id?: string
}

// ── Parse Transcript ────────────────────────────────────────────────────────

export interface ParsedNotesPayload {
  notes: MeetingNote[]
}

export async function parseTranscript(
  cycleId: string,
  meetingId: string,
  transcript: string
): Promise<AgentResponse<ParsedNotesPayload>> {
  return apiFetch<AgentResponse<ParsedNotesPayload>>(
    `/api/cycles/${cycleId}/meeting/parse-transcript`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        meeting_id: meetingId,
        transcript,
      }),
    }
  )
}

// ── Extract transcript text from an uploaded file (.docx / .vtt) ─────────────

export interface ExtractedTranscript {
  text: string
  filename: string
  chars: number
}

/** Read a File as base64 (without the data: URI prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') return reject(new Error('Failed to read file'))
      // result is a data: URI — keep only the base64 payload after the comma.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Upload a .docx or .vtt transcript file; the backend returns the extracted plain
 * text. Sent as base64 JSON so it rides the standard apiFetch client (no multipart).
 */
export async function extractTranscriptFile(
  cycleId: string,
  file: File
): Promise<ExtractedTranscript> {
  const contentB64 = await fileToBase64(file)
  return apiFetch<ExtractedTranscript>(
    `/api/cycles/${cycleId}/meeting/extract-transcript-file`,
    {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, content_b64: contentB64 }),
    }
  )
}

// ── Persisted meeting artifact (parsed notes + generated minutes) ────────────

export interface MeetingArtifact {
  meeting_id: string
  notes: MeetingNote[]
  minutes: MeetingMinutes | null
  parsed_at: string | null
}

/** Fetch the persisted parsed notes + minutes for a meeting (empty if never parsed). */
export async function getMeetingArtifact(
  cycleId: string,
  meetingId?: string
): Promise<MeetingArtifact> {
  return apiFetch<MeetingArtifact>(`/api/cycles/${cycleId}/meeting/artifact`, {
    params: meetingId ? { meeting_id: meetingId } : undefined,
  })
}

// ── Generate Meeting Minutes ────────────────────────────────────────────────

export interface MinutesPayload {
  minutes: MeetingMinutes
}

export async function generateMeetingMinutes(
  cycleId: string,
  meetingId: string,
  notes: MeetingNote[],
  attendees: string[] = [],
  meetingDate?: string
): Promise<AgentResponse<MinutesPayload>> {
  return apiFetch<AgentResponse<MinutesPayload>>(
    `/api/cycles/${cycleId}/meeting/minutes`,
    {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: cycleId,
        meeting_id: meetingId,
        notes,
        attendees,
        meeting_date: meetingDate,
      }),
    }
  )
}

// ── Approval ───────────────────────────────────────────────────────────────

export interface ApprovalResult {
  status: string
  run_id: string
  approved_by: string
  approved_at: string
}

export async function approveMinutes(
  cycleId: string,
  runId: string,
  approvedBy = 'coordinator'
): Promise<ApprovalResult> {
  return apiFetch<ApprovalResult>(
    `/api/cycles/${cycleId}/meeting/minutes/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ run_id: runId, approved_by: approvedBy }),
    }
  )
}

// ── Send Minutes ───────────────────────────────────────────────────────────

export interface SendMinutesRecipient {
  name: string
  email: string
}

export interface SendMinutesResult {
  status: string
  run_id: string
  sent_to: SendMinutesRecipient[]
  count: number
  message_id: string
  sent_at: string
}

export async function sendMeetingMinutes(
  cycleId: string,
  runId: string,
  minutes: MeetingMinutes,
  vendorName: string,
  quarter: string,
  year: number,
  /** Which meeting these minutes belong to, so the email goes to that meeting's own
   *  edited roster ("align-…"/"vprep-…"); omit/undefined for the QBR (cycle list). */
  meetingId?: string
): Promise<SendMinutesResult> {
  return apiFetch<SendMinutesResult>(
    `/api/cycles/${cycleId}/meeting/minutes/send`,
    {
      method: 'POST',
      body: JSON.stringify({
        run_id: runId,
        minutes: { ...minutes, vendor_name: vendorName, quarter, year },
        meeting_id: meetingId,
      }),
    }
  )
}
