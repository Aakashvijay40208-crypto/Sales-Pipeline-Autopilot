-- =====================================================================
-- SALES PIPELINE AUTOPILOT - SUPABASE DATABASE MIGRATION SCHEMA
-- Copy and run this script in your Supabase SQL Editor to initialize 
-- all tables, constraint keys, and schema indexes.
-- =====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Holds auth user profiles mapped to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    photo_url TEXT,
    role TEXT DEFAULT 'user',
    last_login TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow users to update own profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Search History Log Table
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    user_id UUID,
    query JSONB NOT NULL,
    status TEXT DEFAULT 'running',
    leads_found INTEGER DEFAULT 0
);

-- 3. Business Listings Table (Locations metadata from SerpAPI)
CREATE TABLE IF NOT EXISTS public.businesses (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone_number TEXT,
    website TEXT,
    google_rating NUMERIC(3, 2),
    review_count INTEGER,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_audited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_businesses_website ON public.businesses(website);
CREATE INDEX IF NOT EXISTS idx_businesses_category ON public.businesses(category);

-- 4. Website Technical Audits Table (SEO, UX, SSL checks)
CREATE TABLE IF NOT EXISTS public.audit_reports (
    place_id TEXT REFERENCES public.businesses(place_id) ON DELETE CASCADE PRIMARY KEY,
    website_status INTEGER,
    is_https BOOLEAN DEFAULT false,
    response_time_ms INTEGER,
    seo JSONB,            -- { title, description, h1Hierarchy, canonical, hasRobots, hasSitemap }
    ux JSONB,             -- { isMobileFriendly, hasHeroSection, hasCTA, hasFooter }
    tech_detected JSONB,  -- { bookingSystem, whatsapp, chatWidget, crm, paymentGateway, newsletter, facebookPixel, googleAnalytics }
    contacts JSONB,       -- { emails: [], phoneNumbers: [], socialLinks: { linkedin, facebook, instagram, twitter, youtube } }
    screenshots JSONB     -- { desktopUrl, mobileUrl }
);

-- 5. Lead Scores and AI Consultancy Pitches Table
CREATE TABLE IF NOT EXISTS public.lead_scores (
    place_id TEXT REFERENCES public.businesses(place_id) ON DELETE CASCADE PRIMARY KEY,
    score INTEGER NOT NULL,
    priority TEXT NOT NULL, -- 'HOT' | 'MEDIUM' | 'LOW'
    failed_checks TEXT[] DEFAULT '{}',
    recommended_services TEXT[] DEFAULT '{}',
    personalized_pitch TEXT,
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_priority ON public.lead_scores(priority);
CREATE INDEX IF NOT EXISTS idx_lead_scores_score ON public.lead_scores(score);

-- 6. Persistent CRM Leads Table (Sales Pipeline Autopilot)
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id TEXT PRIMARY KEY,
    place_id TEXT,
    business_name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    email TEXT,
    linkedin TEXT,
    google_rating NUMERIC(3, 2),
    review_count INTEGER DEFAULT 0,
    lifecycle_stage TEXT DEFAULT 'Discovered', -- 'Discovered', 'Qualified', 'Outreach Ready', 'Contacted', 'Interested', 'Follow-up Later', 'Meeting Requested', 'Opportunity', 'Won', 'Lost', 'Opted Out'
    latest_reply_classification TEXT DEFAULT 'None', -- 'Interested', 'Not Interested', 'Follow-up Later', 'Meeting Request', 'Opt-out', 'Needs Human Review'
    lead_score INTEGER DEFAULT 50,
    priority TEXT DEFAULT 'MEDIUM',
    is_opted_out BOOLEAN DEFAULT false,
    opt_out_timestamp TIMESTAMP WITH TIME ZONE,
    opt_out_reason TEXT,
    next_action TEXT,
    next_follow_up_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    source TEXT DEFAULT 'Prospect Scan',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON public.crm_leads(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_classification ON public.crm_leads(latest_reply_classification);
CREATE INDEX IF NOT EXISTS idx_crm_leads_opt_out ON public.crm_leads(is_opted_out);

-- 7. Unified Conversation Messages Table
CREATE TABLE IF NOT EXISTS public.conversation_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    channel TEXT DEFAULT 'email', -- 'email', 'chat', 'internal_note', 'system'
    direction TEXT DEFAULT 'outbound', -- 'inbound', 'outbound', 'internal'
    sender_type TEXT DEFAULT 'salesperson', -- 'customer', 'salesperson', 'ai_agent', 'system'
    sender_name TEXT,
    sender_email TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'sent', -- 'draft', 'sent', 'received', 'simulated'
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_lead ON public.conversation_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_time ON public.conversation_messages(timestamp);

-- 8. Sales Activities Timeline Table
CREATE TABLE IF NOT EXISTS public.sales_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- 'status_change', 'reply_classified', 'follow_up_scheduled', 'opt_out_recorded', 'email_drafted', 'chat_message'
    description TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    performed_by TEXT DEFAULT 'ai_autopilot',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_act_lead ON public.sales_activities(lead_id);

-- 9. Follow-Up Tasks & Email Drafts Table
CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
    task_type TEXT DEFAULT 'email_follow_up', -- 'email_follow_up', 'meeting_prep', 'human_review', 'call'
    priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
    email_draft JSONB DEFAULT '{}', -- { subject: text, body: text }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.follow_up_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.follow_up_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.follow_up_tasks(status);

-- 10. Customer Requirements Table
CREATE TABLE IF NOT EXISTS public.customer_requirements (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL UNIQUE,
    pain_points TEXT[] DEFAULT '{}',
    budget TEXT DEFAULT 'Not stated',
    timeline TEXT DEFAULT 'Not stated',
    requested_deliverables TEXT[] DEFAULT '{}',
    objections TEXT[] DEFAULT '{}',
    decision_maker TEXT DEFAULT 'Unknown',
    preferences TEXT,
    source TEXT DEFAULT 'customer_statement',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 11. Secure Private Customer Chat Links Table
CREATE TABLE IF NOT EXISTS public.secure_conversation_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_secure_links_hash ON public.secure_conversation_links(token_hash);

-- Enable Row Level Security (RLS)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_conversation_links ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users access
CREATE POLICY "Allow authenticated access on crm_leads" ON public.crm_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access on conversation_messages" ON public.conversation_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access on sales_activities" ON public.sales_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access on follow_up_tasks" ON public.follow_up_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access on customer_requirements" ON public.customer_requirements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access on secure_conversation_links" ON public.secure_conversation_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
