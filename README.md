# Sales Pipeline Autopilot 🚀

**Sales Pipeline Autopilot** is an autonomous, AI-powered sales workflow and CRM application. It discovers high-intent local business leads, runs live headless browser audits, maintains chronological multi-channel conversation history, classifies incoming customer replies in real-time, automatically advances CRM lifecycle stages, generates tailored follow-up email drafts, calculates exact future reminder dates, and provisions secure private links for customer chat consultation.

---

## Key Capabilities & Features

1. **Lead Discovery & Deep Technical Auditing**
   - Discovers local B2B businesses via Google Maps (SerpAPI integration with automatic key rotation).
   - Headless Playwright (Chromium) engine audits websites for mobile responsiveness, SSL security, load times, SEO meta tags, and tech stack detection (booking engines, WhatsApp CTAs, CRMs, and pixels).
   - Extracts direct contact emails and social links.

2. **Persistent Lead CRM**
   - Seamlessly persists leads across application reloads, server restarts, and user sessions.
   - Dual-mode architecture: connects directly to **Supabase PostgreSQL** when credentials are configured, and automatically falls back to local persistence (`local_db.json`) during offline, testing, or demo modes.
   - Tracks lifecycle stages: *Discovered*, *Qualified*, *Outreach Ready*, *Contacted*, *Interested*, *Follow-up Later*, *Meeting Requested*, *Opportunity*, *Won*, *Lost*, *Opted Out*.

3. **Unified Chronological Conversation History**
   - Single source of truth across outbound emails, incoming customer replies, private client chats, and internal sales notes.
   - Distinguishes channel, direction (`inbound` vs `outbound` vs `internal`), and delivery status.

4. **AI Reply Intent Classification & Automatic CRM Updates**
   - Instantly categorizes customer replies into:
     - `Interested` ➡️ Advances to **Interested**, generates scoped proposal draft, creates high-priority task.
     - `Follow-up Later` ➡️ Extracts requested timeframe (e.g., *"5 months"*, *"next quarter"*, *"in 2 weeks"*), calculates relative due date, transitions stage to **Follow-up Later**, and creates a scheduled task with a tailored reconnect draft.
     - `Meeting Request` ➡️ Transitions to **Meeting Requested** and schedules a meeting coordination task.
     - `Not Interested` ➡️ Records objections, transitions deal to **Lost**, and suppresses automatic outreach.
     - `Opt-out` ➡️ Activates persistent **Do-Not-Contact** suppression flag (`is_opted_out = true`), immediately cancels pending follow-up tasks, and blocks future outbound marketing sends.
     - `Needs Human Review` ➡️ Flags ambiguous or contradictory replies for human attention.

5. **Future Follow-ups & Tailored Email Drafts**
   - Persistent task manager filtering by *Due Today*, *Overdue*, *Upcoming*, and *Completed*.
   - Sales reps can review the AI-generated email draft, edit, and click **"Approve & Send Email"** with strict opt-out suppression enforcement.

6. **Secure Customer Chat via Private Link**
   - Generates cryptographically secure, 256-bit entropy private token links (`/chat/:token`).
   - Token hash (`SHA-256`) is verified on every request with expiration support.
   - Grounded AI assistant answers client queries regarding website design packages, turnaround timelines, and deliverables without ever leaking internal notes, lead scores, or other customers' data.

7. **Interactive Reply Lab**
   - Testing sandbox with pre-loaded scenarios (*"Contact in 5 months"*, *"Interested"*, *"Meeting Request"*, *"Opt-out"*, *"Existing provider"*, etc.).
   - Visualizes classification confidence, explanation, timeframe parsing, proposed CRM transition, and drafted emails.

8. **Executive Overview Dashboard & Excel Export**
   - Live metrics: Total Saved Leads, Qualified Leads, Interested Customers, Tasks Due Today, Overdue Follow-ups, and Waiting for Reply.
   - Styled Excel export (`openpyxl`) with color-coded priority fills and lead intelligence.

---

## Tech Stack & Architecture

- **Frontend**: React 18, Vite, Lucide Icons, modern SaaS light design system (`#F5F8FD` page background, `#FFFFFF` surfaces, `#4F7DF3` primary accent).
- **Backend**: Python 3.10+ / 3.14, Flask, Flask-CORS, Playwright (Chromium), Requests, openpyxl.
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS) + Local JSON DB (`local_db.json`) fallback.
- **Testing**: Pytest with automated coverage for NLP classification, relative timeframe calculation, CRM state transitions, opt-out suppression, and secure links.

---

## Directory Structure

```
ai-lead-generator/
├── backend/
│   ├── app.py                   # Main Flask REST API (CRM, search, chat routes)
│   ├── autopilot_engine.py      # Classification engine, timeframe parser, chat bot
│   ├── supabase_client.py       # Supabase client + local_db.json dual-mode storage
│   ├── api_manager.py           # API key rotation and health tracking
│   ├── serpapi_client.py        # SerpAPI Google Maps discovery scraper
│   ├── playwright_auditor.py    # Playwright browser auditing engine
│   ├── lead_scorer.py           # Lead qualification & scoring model
│   ├── export_manager.py        # openpyxl styled Excel sheet builder
│   ├── local_db.json            # Local persistence database
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Environment variables template
│   └── tests/
│       ├── test_api_manager.py      # API rotation tests
│       ├── test_autopilot_engine.py # Classifier & timeframe unit tests
│       ├── test_crm_api_routes.py   # Full CRM lifecycle & route tests
│       └── test_lead_scorer.py      # Scoring tests
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Main router, navigation, and auth view
│   │   ├── styles/theme.css         # Light SaaS theme design tokens
│   │   ├── components/
│   │   │   ├── Sidebar.jsx              # Navigation sidebar
│   │   │   ├── TopHeader.jsx            # Header bar with sync action
│   │   │   ├── OverviewView.jsx         # Executive dashboard stats & feed
│   │   │   ├── FindLeadsView.jsx        # Prospect discovery & scan engine
│   │   │   ├── PipelineView.jsx         # Kanban board & table views
│   │   │   ├── ConversationsView.jsx    # Unified inbox & reply recorder
│   │   │   ├── FollowUpsView.jsx        # Follow-up scheduler & draft approval
│   │   │   ├── ReplyLabView.jsx         # Interactive AI testing sandbox
│   │   │   ├── SettingsView.jsx         # Integration & health dashboard
│   │   │   ├── LeadWorkspaceModal.jsx   # Complete lead detail dossier
│   │   │   ├── CustomerChatView.jsx     # Client private chat link interface
│   │   │   ├── SearchPanel.jsx          # Discovery scan criteria panel
│   │   │   ├── LeadsGrid.jsx            # Lead cards grid with filters
│   │   │   └── AuditModal.jsx           # Technical audit results modal
│   ├── package.json
│   └── index.html
├── schema.sql                   # Supabase PostgreSQL database migration
└── README.md
```

---

## Database Migration (Supabase)

To initialize the database in your Supabase project, execute the SQL migration script in [schema.sql](file:///c:/Users/Aakash%20V/OneDrive/Desktop/ai-lead-generator/schema.sql) in the **Supabase SQL Editor**:

Tables provisioned:
- `profiles` (User metadata)
- `search_history` (Prospect scan history)
- `businesses` (Raw location listings from SerpAPI)
- `audit_reports` (Technical website audits)
- `lead_scores` (Heuristic scoring & recommendations)
- `crm_leads` (Persistent CRM leads, lifecycle stages, opt-out flags)
- `conversation_messages` (Unified chronological communication stream)
- `sales_activities` (Audit trail of automated & human decisions)
- `follow_up_tasks` (Follow-up reminders & personalized email drafts)
- `customer_requirements` (Extracted pain points, budget, timeline, objections)
- `secure_conversation_links` (High-entropy private token hashes for customer chat)

---

## Environment Variables

### Backend (`backend/.env`):
```ini
# Supabase Configuration (Optional - falls back to local_db.json if omitted)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-or-service-key

# SerpAPI Configuration (for live Google Maps business discovery)
SERPAPI_API_KEY=your_serpapi_key

# Flask Server Config
PORT=5000
FLASK_ENV=development
```

### Frontend (`frontend/.env`):
```ini
VITE_API_BASE_URL=http://localhost:5000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Running the Application

### 1. Backend Setup & Startup
```powershell
# From the repository root
cd backend

# Install dependencies
pip install -r requirements.txt

# (Optional) Install Playwright Chromium browser if auditing live sites
playwright install chromium

# Run the Flask API server
python app.py
```
*Backend runs on `http://localhost:5000`.*

### 2. Frontend Setup & Startup
```powershell
# From the repository root in a separate terminal
cd frontend

# Install dependencies
npm install

# Run the Vite development server
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## Running the Test Suite

Execute the comprehensive automated test suite across all modules:
```powershell
python -m pytest backend/tests -o pythonpath=backend
```
**Test Results**: 19 passed tests covering API key rotations, heuristic lead scoring, NLP reply classification, relative timeframe extraction (e.g. 5 months ➡️ +150 days), CRM stage progression, opt-out suppression enforcement, and cryptographic private chat link tokens.
