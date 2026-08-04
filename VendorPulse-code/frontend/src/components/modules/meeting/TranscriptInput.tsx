import { useRef, useState } from 'react'
import { FileText, Sparkles, CheckCircle2, RotateCcw, Paperclip, Loader2 } from 'lucide-react'
import type { MeetingNote } from '@/types/meeting.types'
import { parseTranscript, extractTranscriptFile } from '@/lib/meetingApi'
import AgentStatusBadge from '@/components/shared/AgentStatusBadge'
import type { AgentStatus } from '@/types/agent.types'

interface Props {
  cycleId: string
  onParsed: (notes: MeetingNote[]) => void
  /** Override the meeting id used when parsing (scopes minutes per meeting). */
  meetingId?: string
  /** True when this meeting has ALREADY had a transcript parsed (e.g. action items
   *  already extracted). Starts the panel in its collapsed "done" state so it doesn't
   *  re-prompt for an upload that already happened. */
  alreadyExtracted?: boolean
}

const DEMO_TRANSCRIPT = `David Okafor [08:58]: Morning all. Quick housekeeping — this session is being recorded for minutes. We have six agenda items and 90 minutes. I'll be strict on time. Joining us remotely are Ananya Krishnan from Zensar's legal team and Tom Hargreaves from Shell's Group Procurement. Welcome both.

Ananya Krishnan [09:00]: Thank you. I'm here in an advisory capacity on the contract matters flagged in the pre-read.

Sarah Chen [09:02]: Before we start the formal agenda, I want to note that Zensar's pre-read submission arrived at 11:48 PM last night — less than nine hours before this meeting. The agreement is 48 hours. This isn't the first time.

Raj Patel [09:04]: The delay was due to our CFO requiring sign-off on the commercial data before release. That's an internal governance requirement we can't bypass. I understand the frustration but this wasn't avoidable.

Sarah Chen [09:06]: I'm noting it formally. If it happens in Q3, we'll invoke the governance breach clause. Moving on.

David Okafor [09:08]: Agenda item one — scorecard results. Overall Zensar score is 3.1 this quarter, down from 3.6 in Q4. That's the steepest single-quarter decline we've recorded on this account. Alex, walk us through the breakdown.

Alex Thompson [09:10]: Risk and Compliance dropped to 2.4 — lowest category score we've ever given a Tier 1 vendor. This is driven by the March audit findings: three control gaps in access management, one unpatched critical vulnerability open for 47 days, and a GDPR data handling incident that we're still investigating. All of these are being reviewed by Shell's CISO office.

Raj Patel [09:13]: Zensar takes the audit findings seriously. The access management gaps have been remediated as of last Friday. The vulnerability was in a third-party library we have no direct control over — we escalated to the vendor on day one and patched within their release cycle.

Emma Davies [09:15]: 47 days is 47 days, regardless of the upstream dependency. Our security policy treats any critical CVE open beyond 30 days as a breach of Schedule 7. There's no carve-out for third-party libraries.

Ananya Krishnan [09:17]: I'd like to review the exact Schedule 7 language before we characterise this as a formal breach. The clause refers to vulnerabilities "within Zensar's direct control." That qualifier is relevant here.

Emma Davies [09:19]: I have Schedule 7 in front of me. Clause 7.4 reads: "Zensar shall remediate or apply compensating controls to any Critical severity vulnerability within 30 days of identification, regardless of origin." The phrase "regardless of origin" overrides the qualifier you're referencing.

Ananya Krishnan [09:21]: That clause was amended in the April 2025 addendum. I'll need to check the consolidated version. Can we table the formal breach determination until I confirm the current contract text?

David Okafor [09:23]: Fair enough. Decision: formal breach determination on the CVE matter is deferred pending Ananya's contract review. Deadline for her confirmation — end of business 11 April.

Tom Hargreaves [09:24]: From a procurement standpoint, if this does constitute a formal breach, it triggers a 30-day cure period and activates the performance bond clause. I want that on record.

Raj Patel [09:26]: Noted. Zensar's position is that the patch was applied in good faith and within the upstream vendor's SLA. We'll submit a formal written position alongside Ananya's review.

Sarah Chen [09:28]: Raj, that's an action for you — written position on the CVE remediation timeline, submitted to Emma and Tom by 11 April.

Raj Patel [09:29]: Agreed.

David Okafor [09:31]: The GDPR incident — what's the current status?

Alex Thompson [09:32]: A data extract containing personal contact details of 340 internal stakeholders was sent to an incorrect Zensar distribution list on 3 March. The data was deleted and confirmed destroyed by 5 March, but we have a legal obligation to assess whether this constitutes a reportable breach under UK GDPR Article 33.

Priya Sharma [09:34]: Has Shell's DPO made a notifiability determination yet?

Alex Thompson [09:35]: Not yet. The DPO has 72 hours from the moment of discovery to notify the ICO if required. We discovered the extent on 28 March — so the window has passed either way. The question now is whether a retrospective voluntary disclosure is warranted.

Ananya Krishnan [09:37]: Zensar's legal team strongly recommends voluntary disclosure to the ICO if there's any ambiguity. The ICO treats voluntary disclosure as a significant mitigating factor.

Emma Davies [09:39]: I agree. Shell's DPO should be looped in immediately if they haven't already been. This should not be sitting in an ops review — it needs legal escalation today.

David Okafor [09:41]: Action: Alex to escalate the GDPR incident formally to Shell's DPO and Legal by close of business today. Zensar to provide a full incident timeline and impact assessment to Shell Legal by 10 April.

Raj Patel [09:42]: We'll have that ready. Ananya, can you coordinate on our side?

Ananya Krishnan [09:43]: Yes, I'll own the Zensar incident report delivery.

David Okafor [09:45]: Moving to agenda item two — the offshore transition. Zensar proposed a 40% shift of delivery resource to Chennai by Q3. James, you flagged concerns in the pre-read.

James O'Brien [09:47]: Three concerns. First, the roles being offshored include two that are contractually designated as UK-based under Schedule 2 — that requires a formal contract amendment, not a unilateral operational decision. Second, the cost saving Zensar is projecting assumes a like-for-like skill match which our technical team disputes. Third, the transition timeline of 12 weeks is, in our view, not feasible without service disruption.

Meera Joshi [09:50]: On the contractual point, Schedule 2 designates the roles as UK-based at the time of signing in 2022. We believe the spirit of that clause was about time zones and availability, not geography. The Chennai team operates in overlapping hours.

James O'Brien [09:52]: The spirit doesn't matter — the language does. Schedule 2 is explicit. We need a formal amendment signed before any offshore movement of those two roles.

Tom Hargreaves [09:54]: I can confirm from procurement's side that moving Schedule 2 designated roles without an amendment would constitute a material change under the contract. That's non-negotiable.

Meera Joshi [09:55]: We're not trying to circumvent the contract. We can initiate the amendment process. How long does that typically take on Shell's side?

Tom Hargreaves [09:57]: Six to eight weeks minimum, depending on legal review. If Zensar submits the formal change request by 15 April, we could realistically have an amendment executed by mid-June.

David Okafor [09:59]: Decision: No offshore movement of Schedule 2-designated roles until the contract amendment is executed. Zensar to submit the formal change request to Tom by 15 April.

Meera Joshi [10:01]: Understood. What about the non-Schedule 2 roles? Can those proceed on the proposed timeline?

James O'Brien [10:02]: We'd need to see the skills matrix and a transition risk assessment before we can approve even the unrestricted roles. Twelve weeks feels very aggressive given what we know about the current team's project knowledge.

David Okafor [10:04]: Action: Zensar to provide skills matrix and transition risk assessment for all proposed offshore roles — Schedule 2 and non-Schedule 2 — by 18 April. Shell delivery team to review and respond within five business days of receipt.

Raj Patel [10:06]: Can I raise something before we move on? The offshore proposal is partly a response to pressure from Shell's own commercial team to reduce rates. We're being asked to cut costs while simultaneously being held to UK-based staffing requirements. That's a contradiction we need to acknowledge.

Tom Hargreaves [10:08]: The rate reduction discussion is a separate workstream. It's not appropriate to link them operationally in this forum.

Raj Patel [10:09]: With respect, they're not separate from Zensar's perspective. We can have that conversation, but we'd ask that it be tabled as a formal agenda item at the next EGB rather than handled in parallel channels.

Sarah Chen [10:11]: That's a reasonable ask. I'll add it to the Q2 EGB agenda — offshore strategy and commercial rate framework to be discussed together.

David Okafor [10:13]: Agenda item three — innovation scorecard. Zensar's innovation KPI score was 2.8. The Q4 commitment was to deliver two proof-of-concept submissions by end of March. We received one.

Meera Joshi [10:15]: The second PoC — the predictive maintenance module — was deprioritised internally because Shell's product team indicated in January that the use case had been superseded by a Group-level initiative. We have that in writing.

Alex Thompson [10:17]: That's the first I'm hearing of this. Who in the product team communicated that?

Meera Joshi [10:18]: It was a message from Chris Webb on 9 January. I can forward the email chain.

Alex Thompson [10:20]: Please do. If Chris Webb made a unilateral call that affected Zensar's contractual KPI delivery without informing the governance team, that's a process failure on our side. I apologise if that's what happened.

Sarah Chen [10:22]: Let's not get ahead of ourselves. Meera, forward that email chain to David and me by end of today. We'll review and if it confirms what you've described, we'll adjust the innovation score retrospectively and issue an apology in writing.

Meera Joshi [10:24]: I'll send it within the hour. I appreciate the openness to reviewing it.

David Okafor [10:26]: On the one PoC that was delivered — the demand forecasting model — Shell's data science team reviewed it last week. Genuinely impressive work. The accuracy improvement over our baseline was 23%, which exceeded the 15% target. That needs to be recognised.

Priya Sharma [10:27]: The team that built that worked two weekends in a row to hit the submission window. I'll make sure they hear that feedback.

David Okafor [10:28]: Please do. Action: Shell innovation team to formally assess retrospective adjustment to Zensar's Q1 innovation score pending review of the January email chain. Decision to be communicated to Zensar by 16 April.

Alex Thompson [10:31]: Agenda item four — relationship scores. Communication effectiveness dropped from 4.1 to 3.0. That's a big move. Stakeholders flagged two specific issues: delayed responses on escalations and what one reviewer called "inconsistent messaging between account management and delivery teams."

Raj Patel [10:33]: The delayed escalation responses in February were tied to a period when our account director was on medical leave. We didn't have a clear cover arrangement in place. That's been addressed — we now have a named deputy account director who is empowered to respond to Tier 1 escalations within four hours.

Sarah Chen [10:35]: Who is the deputy?

Raj Patel [10:36]: Leena Kapoor. She attended the last two internal governance calls as an observer. She'll be at all EGBs going forward.

Sarah Chen [10:37]: Good. On the inconsistent messaging point — can you give an example, Alex?

Alex Thompson [10:38]: In March, Zensar's account management team told our delivery lead that the offshore proposal had been shelved. Two weeks later, we received the formal proposal document. That kind of misalignment erodes trust.

Meera Joshi [10:40]: I can explain that. The proposal was shelved internally, then revived after the commercial rate discussion escalated. The account management team wasn't informed of the revival before the document went out. That's an internal coordination failure and I own it.

David Okafor [10:42]: Action: Zensar to establish a single point of communication protocol for all programme-level decisions — no client-facing communication without account director sign-off. Protocol document to be shared with Shell's VMO by 25 April.

Raj Patel [10:43]: Agreed. We'll formalise that.

David Okafor [10:47]: Final agenda item — Q2 planning. Given the Q1 scores, Zensar is now in the Amber performance band. That triggers a 30-day improvement plan under the contract.

Ananya Krishnan [10:48]: Before we formalise the improvement plan, I want to note that some of the Q1 score drivers are contested — the resource score methodology and potentially the innovation score. It may be premature to activate the Amber band mechanism until those are resolved.

Tom Hargreaves [10:50]: The Amber band is triggered by the published score, not by the uncontested score. If the score is later adjusted, the improvement plan can be terminated early. But we can't delay activating it — the contract is explicit on timing.

Ananya Krishnan [10:52]: I understand the position. Zensar will engage with the improvement plan process while formally reserving our right to challenge the trigger score.

David Okafor [10:53]: Noted on record. Decision: 30-day improvement plan formally initiated as of today's date. Zensar to submit draft improvement plan to Shell's VMO by 18 April. Shell to review and countersign within five business days.

James O'Brien [10:55]: I'd like the improvement plan to specifically address Risk and Compliance — the 2.4 score there is what concerns me most going into Q2. I want measurable milestones, not narrative commitments.

Raj Patel [10:56]: Understood. We'll include a Risk and Compliance remediation roadmap with fortnightly checkpoint milestones.

Sarah Chen [10:58]: Before we close — I want to acknowledge something. This has been one of the harder EGBs we've had. There are legitimate disputes on both sides, and some of today's issues reflect process failures on Shell's side as well as Zensar's. I think the fact that we're having these conversations openly and that both sides are willing to own their failures is actually a sign the partnership is working. I want that on record.

Raj Patel [11:00]: Appreciated, Sarah. Zensar values this programme and we want to get back to Green band in Q2. We'll do our part.

David Okafor [11:01]: Thank you all. Minutes will be circulated within 48 hours for review before finalisation.`

export default function TranscriptInput({ cycleId, onParsed, meetingId, alreadyExtracted = false }: Props) {
  const [transcript, setTranscript] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [parsedCount, setParsedCount] = useState<number | null>(null)
  const [reopened, setReopened] = useState(false)
  // File-upload (.docx/.vtt → text) state.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [attachedName, setAttachedName] = useState<string | null>(null)

  // Collapse to the "done" state when a transcript has been parsed this session or
  // was already parsed before — unless the user explicitly reopens to parse another.
  const showDone = (parsedCount !== null || alreadyExtracted) && !reopened

  async function handleParse() {
    if (!transcript.trim()) return
    setAgentStatus('running')
    setError(null)
    try {
      const mid = meetingId ?? `mtg-${cycleId}`
      const response = await parseTranscript(cycleId, mid, transcript)
      if (response.status === 'success' && response.data) {
        const notes = response.data.notes ?? []
        setAgentStatus('complete')
        setParsedCount(notes.length)
        setReopened(false)
        onParsed(notes)
      } else {
        setError(response.summary || 'Failed to parse transcript')
        setAgentStatus('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach backend')
      setAgentStatus('idle')
    }
  }

  // Attach a .docx or .vtt file — the backend extracts its text, which we drop into
  // the transcript box for the coordinator to review/edit before parsing.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = ''
    if (!file) return

    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.docx') && !lower.endsWith('.vtt')) {
      setError('Unsupported file type. Attach a .docx or .vtt transcript.')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const res = await extractTranscriptFile(cycleId, file)
      // Append to any existing text so an attachment doesn't wipe a manual paste.
      setTranscript((prev) => (prev.trim() ? `${prev.trim()}\n\n${res.text}` : res.text))
      setAttachedName(res.filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the file.')
    } finally {
      setUploading(false)
    }
  }

  if (showDone) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transcript parsed</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {parsedCount !== null
                  ? `${parsedCount} item${parsedCount === 1 ? '' : 's'} extracted into minutes and the action queue.`
                  : 'This meeting already has a parsed transcript; its action items are in the queue below.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setReopened(true); setTranscript(''); setAgentStatus('idle'); setError(null); setAttachedName(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
          >
            <RotateCcw size={13} /> Parse a different transcript
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Transcript Paste & Parse
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <AgentStatusBadge status={agentStatus} />
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.vtt"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || agentStatus === 'running'}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 font-medium"
            title="Attach a .docx or .vtt transcript file"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {uploading ? 'Reading…' : 'Attach file'}
          </button>
          <button
            onClick={() => setTranscript(DEMO_TRANSCRIPT)}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
          >
            Load Transcript
          </button>
        </div>
      </div>

      {attachedName && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Paperclip size={11} className="shrink-0" />
          Loaded from <span className="font-medium text-slate-600 dark:text-slate-300">{attachedName}</span> — review the text below before parsing.
        </p>
      )}

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the full meeting transcript here — or use “Attach file” to load a .docx or .vtt (e.g. a Teams transcript export). Claude will parse it into structured note types: questions, objections, decisions, appreciations, and action items..."
        rows={8}
        className="w-full text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
      />

      <button
        onClick={handleParse}
        disabled={!transcript.trim() || agentStatus === 'running'}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Sparkles size={14} />
        {agentStatus === 'running' ? 'Parsing transcript...' : 'Parse Transcript'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
