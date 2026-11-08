--
-- PostgreSQL database dump
--

\restrict mfqHbghmtfx8Xm5a4lkd2AfFCHLhTH11I88oXdhjuwJckUHyziLBcW2juonOhXd

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: evaluation; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA evaluation;


--
-- Name: internship; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA internship;


--
-- Name: operation; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA operation;


--
-- Name: progress; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA progress;


--
-- Name: support; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA support;


--
-- Name: thesis; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA thesis;


--
-- Name: user_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA user_auth;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: assignment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assignment_status_enum AS ENUM (
    'IN_PROGRESS',
    'ALLOWED_TO_DEFEND',
    'BANNED_FROM_DEFENSE',
    'COMPLETED',
    'FAILED'
);


--
-- Name: campaign_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status_enum AS ENUM (
    'DRAFT',
    'OPEN',
    'IN_PROGRESS',
    'DEFENSE',
    'CLOSED',
    'ARCHIVED'
);


--
-- Name: campaign_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_type_enum AS ENUM (
    'THESIS',
    'INTERNSHIP',
    'COMBINED'
);


--
-- Name: council_position_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.council_position_enum AS ENUM (
    'CHAIRMAN',
    'SECRETARY',
    'REVIEWER_MEMBER',
    'COMMISSIONER'
);


--
-- Name: eligibility_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.eligibility_status_enum AS ENUM (
    'ELIGIBLE',
    'INELIGIBLE',
    'DROPPED_OUT',
    'DEFERRED'
);


--
-- Name: evaluator_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evaluator_role_enum AS ENUM (
    'SUPERVISOR',
    'REVIEWER',
    'COUNCIL_MEMBER',
    'INTERNSHIP_LECTURER'
);


--
-- Name: exception_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.exception_type_enum AS ENUM (
    'CHANGE_TOPIC',
    'CHANGE_SUPERVISOR',
    'CHANGE_COMPANY',
    'EXTEND_DEADLINE',
    'DEFER_DEFENSE',
    'WITHDRAW_COURSE',
    'REOPEN_GRADE_LOCK'
);


--
-- Name: milestone_phase_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.milestone_phase_enum AS ENUM (
    'TOPIC_SUBMISSION',
    'TOPIC_APPROVAL',
    'WISH_REGISTRATION',
    'OUTLINE_SUBMISSION',
    'MIDTERM_REPORT_1',
    'MIDTERM_REPORT_2',
    'FINAL_SUBMISSION',
    'GRADING_REVIEW',
    'DEFENSE_COUNCIL',
    'POST_DEFENSE_ARCHIVE',
    'CAMPAIGN_CLOSURE'
);


--
-- Name: placement_source_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.placement_source_enum AS ENUM (
    'SCHOOL_ASSIGNED',
    'STUDENT_SELF_FOUND'
);


--
-- Name: placement_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.placement_status_enum AS ENUM (
    'PENDING_VERIFICATION',
    'APPROVED',
    'REJECTED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: registration_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registration_status_enum AS ENUM (
    'PENDING_LECTURER',
    'APPROVED_BY_LECTURER',
    'REJECTED_BY_LECTURER',
    'AUTO_ASSIGNED',
    'CANCELLED'
);


--
-- Name: request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status_enum AS ENUM (
    'PENDING',
    'APPROVED_STEP_1',
    'APPROVED_FINAL',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: role_code_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role_code_enum AS ENUM (
    'SYSTEM_ADMIN',
    'TRAINING_DEPT',
    'FACULTY_MANAGER',
    'DEPT_HEAD',
    'LECTURER',
    'STUDENT',
    'ENTERPRISE_MENTOR'
);


--
-- Name: topic_source_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.topic_source_enum AS ENUM (
    'LECTURER_PROPOSED',
    'STUDENT_PROPOSED',
    'DEPARTMENT_ASSIGNED'
);


--
-- Name: topic_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.topic_status_enum AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'REVISION_REQUIRED',
    'APPROVED',
    'REJECTED',
    'ASSIGNED',
    'CANCELLED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_years (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(20) NOT NULL,
    start_year integer NOT NULL,
    end_year integer NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_id uuid,
    actor_role character varying(50),
    action character varying(100) NOT NULL,
    entity_table character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    old_values jsonb,
    new_values jsonb,
    reason text,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_role_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_eligible_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_eligible_students (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status public.eligibility_status_enum DEFAULT 'ELIGIBLE'::public.eligibility_status_enum,
    ineligible_reason text,
    verified_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_milestones (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    phase public.milestone_phase_enum NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    hard_deadline_at timestamp with time zone,
    is_mandatory boolean DEFAULT true,
    is_locked_override boolean,
    sequence_order integer NOT NULL,
    CONSTRAINT campaign_milestones_check CHECK ((end_at >= start_at))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    semester_id uuid NOT NULL,
    faculty_id uuid NOT NULL,
    major_id uuid,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    type public.campaign_type_enum NOT NULL,
    status public.campaign_status_enum DEFAULT 'DRAFT'::public.campaign_status_enum,
    min_credits_required integer DEFAULT 100,
    min_gpa_required numeric(3,2) DEFAULT 2.00,
    max_students_per_topic integer DEFAULT 2,
    max_wish_choices integer DEFAULT 3,
    allow_student_propose_topic boolean DEFAULT true,
    allow_self_find_company boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tax_code character varying(50),
    name character varying(255) NOT NULL,
    industry character varying(150),
    address text,
    website character varying(255),
    contact_email character varying(255),
    contact_phone character varying(20),
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: council_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.council_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    council_id uuid NOT NULL,
    lecturer_id uuid NOT NULL,
    "position" public.council_position_enum NOT NULL
);


--
-- Name: defense_councils; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.defense_councils (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    department_id uuid,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    room character varying(100),
    defense_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: defense_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.defense_schedules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    council_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    presentation_order integer NOT NULL,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    meeting_minutes_qa text,
    minutes_file_id uuid,
    post_defense_revision_required boolean DEFAULT false,
    revision_notes text,
    is_revision_approved boolean DEFAULT true
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    faculty_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    faculty_id uuid,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    file_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: evaluation_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_scores (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    evaluation_id uuid NOT NULL,
    criterion_id uuid NOT NULL,
    score numeric(4,2) NOT NULL,
    comment text
);


--
-- Name: evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    evaluator_id uuid NOT NULL,
    rubric_id uuid NOT NULL,
    evaluator_role public.evaluator_role_enum NOT NULL,
    total_score numeric(4,2) NOT NULL,
    general_comment text NOT NULL,
    is_submitted boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT evaluations_total_score_check CHECK (((total_score >= (0)::numeric) AND (total_score <= (10)::numeric)))
);


--
-- Name: exception_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exception_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    type public.exception_type_enum NOT NULL,
    reason text NOT NULL,
    evidence_file_id uuid,
    payload_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.request_status_enum DEFAULT 'PENDING'::public.request_status_enum,
    step1_approver_id uuid,
    step1_comment text,
    step1_at timestamp with time zone,
    final_approver_id uuid,
    final_comment text,
    final_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: faculties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculties (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: final_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.final_grades (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    student_id uuid NOT NULL,
    assignment_id uuid,
    placement_id uuid,
    supervisor_score numeric(4,2),
    reviewer_score numeric(4,2),
    council_avg_score numeric(4,2),
    company_score numeric(4,2),
    final_numeric_score numeric(4,2),
    final_letter_grade character varying(5),
    has_large_discrepancy boolean DEFAULT false,
    is_published boolean DEFAULT false,
    is_final_locked boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT final_grades_final_numeric_score_check CHECK (((final_numeric_score >= (0)::numeric) AND (final_numeric_score <= (10)::numeric)))
);


--
-- Name: grade_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grade_appeals (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    final_grade_id uuid NOT NULL,
    student_id uuid NOT NULL,
    reason text NOT NULL,
    old_score numeric(4,2) NOT NULL,
    new_score numeric(4,2),
    status public.request_status_enum DEFAULT 'PENDING'::public.request_status_enum,
    handled_by uuid,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    group_id uuid NOT NULL,
    student_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now()
);


--
-- Name: internship_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internship_evaluations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    placement_id uuid NOT NULL,
    magic_token_hash character varying(255),
    token_expires_at timestamp with time zone,
    attitude_score numeric(4,2),
    capacity_score numeric(4,2),
    result_score numeric(4,2),
    overall_company_score numeric(4,2),
    company_comment text,
    stamped_evaluation_file_id uuid,
    evaluated_by_name character varying(150),
    evaluated_at timestamp with time zone,
    CONSTRAINT internship_evaluations_overall_company_score_check CHECK (((overall_company_score >= (0)::numeric) AND (overall_company_score <= (10)::numeric)))
);


--
-- Name: internship_placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internship_placements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    student_id uuid NOT NULL,
    company_id uuid NOT NULL,
    position_id uuid,
    supervisor_lecturer_id uuid,
    company_mentor_id uuid,
    source public.placement_source_enum NOT NULL,
    job_title character varying(255),
    acceptance_letter_file_id uuid,
    introduction_letter_file_id uuid,
    start_date date,
    end_date date,
    status public.placement_status_enum DEFAULT 'PENDING_VERIFICATION'::public.placement_status_enum,
    reject_reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: internship_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internship_positions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    company_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    requirements text,
    slots integer DEFAULT 5 NOT NULL,
    filled_slots integer DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'OPEN'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: internship_weekly_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internship_weekly_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    placement_id uuid NOT NULL,
    week_number integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    tasks_performed text NOT NULL,
    results_achieved text,
    mentor_feedback text,
    lecturer_feedback text,
    is_confirmed_by_mentor boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT internship_weekly_logs_week_number_check CHECK (((week_number >= 1) AND (week_number <= 24)))
);


--
-- Name: lecturer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lecturer_profiles (
    user_id uuid NOT NULL,
    department_id uuid NOT NULL,
    academic_degree character varying(50),
    specialization text,
    research_directions text[] DEFAULT '{}'::text[],
    default_thesis_quota integer DEFAULT 10,
    default_internship_quota integer DEFAULT 15,
    is_accepting_students boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lecturer_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lecturer_quotas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    lecturer_id uuid NOT NULL,
    max_students integer DEFAULT 10 NOT NULL,
    max_topics integer DEFAULT 5 NOT NULL,
    current_assigned_students integer DEFAULT 0 NOT NULL,
    CONSTRAINT lecturer_quotas_check CHECK ((current_assigned_students <= max_students))
);


--
-- Name: majors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.majors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    department_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    training_system character varying(50) DEFAULT 'CHINH_QUY'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: meeting_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    assignment_id uuid NOT NULL,
    meeting_date timestamp with time zone NOT NULL,
    location_or_link character varying(255),
    work_done text NOT NULL,
    next_plan text NOT NULL,
    issues text,
    created_by uuid NOT NULL,
    is_confirmed_by_lecturer boolean DEFAULT false,
    lecturer_comment text,
    confirmed_at timestamp with time zone
);


--
-- Name: mentor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_profiles (
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    "position" character varying(100),
    expertise_area character varying(255),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    recipient_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    type character varying(50) NOT NULL,
    reference_type character varying(50),
    reference_id uuid,
    action_url text,
    is_read boolean DEFAULT false,
    is_email_sent boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code public.role_code_enum NOT NULL,
    name character varying(100) NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb
);


--
-- Name: rubric_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_criteria (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    rubric_id uuid NOT NULL,
    clo_code character varying(50),
    title character varying(255) NOT NULL,
    description text,
    max_score numeric(4,2) NOT NULL,
    weight numeric(5,2) DEFAULT 100.00,
    level_guides jsonb DEFAULT '[]'::jsonb,
    display_order integer NOT NULL
);


--
-- Name: rubrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubrics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    target_role public.evaluator_role_enum NOT NULL,
    weight_percentage numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: semesters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semesters (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    academic_year_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_current boolean DEFAULT false
);


--
-- Name: specializations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specializations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    major_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    name character varying(150),
    leader_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_profiles (
    user_id uuid NOT NULL,
    major_id uuid NOT NULL,
    cohort character varying(20),
    class_name character varying(50),
    gpa numeric(3,2),
    accumulated_credits integer DEFAULT 0,
    skills text[] DEFAULT '{}'::text[],
    interests text,
    cv_file_id uuid,
    portfolio_url text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_profiles_gpa_check CHECK (((gpa >= (0)::numeric) AND (gpa <= 4.00)))
);


--
-- Name: submission_feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_feedbacks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    submission_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    attachment_file_id uuid,
    is_approved_milestone boolean,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    assignment_id uuid NOT NULL,
    milestone_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    report_file_id uuid,
    source_code_url text,
    demo_url text,
    description text,
    is_late boolean DEFAULT false,
    late_minutes integer DEFAULT 0,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_files (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    uploaded_by uuid,
    original_name character varying(255) NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100) NOT NULL,
    checksum character varying(64),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: thesis_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thesis_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    group_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    supervisor_id uuid NOT NULL,
    reviewer_id uuid,
    assignment_method character varying(50) DEFAULT 'WISH_MATCHED'::character varying,
    status public.assignment_status_enum DEFAULT 'IN_PROGRESS'::public.assignment_status_enum,
    defense_ban_reason text,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT thesis_assignments_check CHECK ((supervisor_id IS DISTINCT FROM reviewer_id))
);


--
-- Name: timeline_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_overrides (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    milestone_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    extended_until timestamp with time zone NOT NULL,
    reason text NOT NULL,
    granted_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: topic_approval_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_approval_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    topic_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    previous_status public.topic_status_enum NOT NULL,
    new_status public.topic_status_enum NOT NULL,
    feedback_comment text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: topic_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_registrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    group_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    priority_order integer NOT NULL,
    student_note text,
    lecturer_response_note text,
    status public.registration_status_enum DEFAULT 'PENDING_LECTURER'::public.registration_status_enum,
    registered_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone,
    CONSTRAINT topic_registrations_priority_order_check CHECK (((priority_order >= 1) AND (priority_order <= 5)))
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    department_id uuid NOT NULL,
    supervisor_id uuid NOT NULL,
    co_supervisor_id uuid,
    proposed_by_id uuid NOT NULL,
    source public.topic_source_enum NOT NULL,
    code character varying(50),
    title_vi character varying(500) NOT NULL,
    title_en character varying(500),
    description text NOT NULL,
    objectives text,
    required_skills text[] DEFAULT '{}'::text[],
    technologies text[] DEFAULT '{}'::text[],
    research_field character varying(255),
    max_students integer DEFAULT 2 NOT NULL,
    attachment_file_id uuid,
    status public.topic_status_enum DEFAULT 'DRAFT'::public.topic_status_enum,
    similarity_score numeric(5,2) DEFAULT 0.00,
    most_similar_topic_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    faculty_id uuid,
    department_id uuid,
    is_default boolean DEFAULT false,
    assigned_at timestamp with time zone DEFAULT now(),
    major_id uuid,
    campaign_id uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    full_name character varying(150) NOT NULL,
    phone character varying(20),
    avatar_file_id uuid,
    sso_provider character varying(50),
    sso_id character varying(255),
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Data for Name: academic_years; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: campaign_eligible_students; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: campaign_milestones; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: council_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: defense_councils; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: defense_schedules; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: document_templates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: evaluation_scores; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: evaluations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: exception_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: faculties; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: final_grades; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: grade_appeals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: group_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: internship_evaluations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: internship_placements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: internship_positions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: internship_weekly_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: lecturer_profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: lecturer_quotas; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: majors; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: mentor_profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rubric_criteria; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rubrics; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: semesters; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: specializations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: student_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: student_profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: submission_feedbacks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: submissions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: system_files; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: thesis_assignments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: timeline_overrides; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: topic_approval_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: topic_registrations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: topics; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: academic_years academic_years_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years
    ADD CONSTRAINT academic_years_code_key UNIQUE (code);


--
-- Name: academic_years academic_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years
    ADD CONSTRAINT academic_years_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: campaign_eligible_students campaign_eligible_students_campaign_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_eligible_students
    ADD CONSTRAINT campaign_eligible_students_campaign_id_student_id_key UNIQUE (campaign_id, student_id);


--
-- Name: campaign_eligible_students campaign_eligible_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_eligible_students
    ADD CONSTRAINT campaign_eligible_students_pkey PRIMARY KEY (id);


--
-- Name: campaign_milestones campaign_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_milestones
    ADD CONSTRAINT campaign_milestones_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_code_key UNIQUE (code);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_tax_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_tax_code_key UNIQUE (tax_code);


--
-- Name: council_members council_members_council_id_lecturer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.council_members
    ADD CONSTRAINT council_members_council_id_lecturer_id_key UNIQUE (council_id, lecturer_id);


--
-- Name: council_members council_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.council_members
    ADD CONSTRAINT council_members_pkey PRIMARY KEY (id);


--
-- Name: defense_councils defense_councils_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_councils
    ADD CONSTRAINT defense_councils_pkey PRIMARY KEY (id);


--
-- Name: defense_schedules defense_schedules_assignment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_schedules
    ADD CONSTRAINT defense_schedules_assignment_id_key UNIQUE (assignment_id);


--
-- Name: defense_schedules defense_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_schedules
    ADD CONSTRAINT defense_schedules_pkey PRIMARY KEY (id);


--
-- Name: departments departments_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_code_key UNIQUE (code);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: evaluation_scores evaluation_scores_evaluation_id_criterion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores
    ADD CONSTRAINT evaluation_scores_evaluation_id_criterion_id_key UNIQUE (evaluation_id, criterion_id);


--
-- Name: evaluation_scores evaluation_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores
    ADD CONSTRAINT evaluation_scores_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_assignment_id_student_id_evaluator_id_evaluator_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_assignment_id_student_id_evaluator_id_evaluator_key UNIQUE (assignment_id, student_id, evaluator_id, evaluator_role);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: exception_requests exception_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_pkey PRIMARY KEY (id);


--
-- Name: faculties faculties_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculties
    ADD CONSTRAINT faculties_code_key UNIQUE (code);


--
-- Name: faculties faculties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculties
    ADD CONSTRAINT faculties_pkey PRIMARY KEY (id);


--
-- Name: final_grades final_grades_campaign_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_campaign_id_student_id_key UNIQUE (campaign_id, student_id);


--
-- Name: final_grades final_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_pkey PRIMARY KEY (id);


--
-- Name: grade_appeals grade_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_appeals
    ADD CONSTRAINT grade_appeals_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, student_id);


--
-- Name: internship_evaluations internship_evaluations_magic_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_evaluations
    ADD CONSTRAINT internship_evaluations_magic_token_hash_key UNIQUE (magic_token_hash);


--
-- Name: internship_evaluations internship_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_evaluations
    ADD CONSTRAINT internship_evaluations_pkey PRIMARY KEY (id);


--
-- Name: internship_evaluations internship_evaluations_placement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_evaluations
    ADD CONSTRAINT internship_evaluations_placement_id_key UNIQUE (placement_id);


--
-- Name: internship_placements internship_placements_campaign_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_campaign_id_student_id_key UNIQUE (campaign_id, student_id);


--
-- Name: internship_placements internship_placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_pkey PRIMARY KEY (id);


--
-- Name: internship_positions internship_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_positions
    ADD CONSTRAINT internship_positions_pkey PRIMARY KEY (id);


--
-- Name: internship_weekly_logs internship_weekly_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_weekly_logs
    ADD CONSTRAINT internship_weekly_logs_pkey PRIMARY KEY (id);


--
-- Name: internship_weekly_logs internship_weekly_logs_placement_id_week_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_weekly_logs
    ADD CONSTRAINT internship_weekly_logs_placement_id_week_number_key UNIQUE (placement_id, week_number);


--
-- Name: lecturer_profiles lecturer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_profiles
    ADD CONSTRAINT lecturer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: lecturer_quotas lecturer_quotas_campaign_id_lecturer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_quotas
    ADD CONSTRAINT lecturer_quotas_campaign_id_lecturer_id_key UNIQUE (campaign_id, lecturer_id);


--
-- Name: lecturer_quotas lecturer_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_quotas
    ADD CONSTRAINT lecturer_quotas_pkey PRIMARY KEY (id);


--
-- Name: majors majors_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majors
    ADD CONSTRAINT majors_code_key UNIQUE (code);


--
-- Name: majors majors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majors
    ADD CONSTRAINT majors_pkey PRIMARY KEY (id);


--
-- Name: meeting_logs meeting_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_logs
    ADD CONSTRAINT meeting_logs_pkey PRIMARY KEY (id);


--
-- Name: mentor_profiles mentor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_profiles
    ADD CONSTRAINT mentor_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (user_id);


--
-- Name: password_resets password_resets_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_hash_key UNIQUE (token_hash);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: rubric_criteria rubric_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_criteria
    ADD CONSTRAINT rubric_criteria_pkey PRIMARY KEY (id);


--
-- Name: rubrics rubrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubrics
    ADD CONSTRAINT rubrics_pkey PRIMARY KEY (id);


--
-- Name: semesters semesters_academic_year_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_academic_year_id_code_key UNIQUE (academic_year_id, code);


--
-- Name: semesters semesters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_pkey PRIMARY KEY (id);


--
-- Name: specializations specializations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specializations
    ADD CONSTRAINT specializations_code_key UNIQUE (code);


--
-- Name: specializations specializations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specializations
    ADD CONSTRAINT specializations_pkey PRIMARY KEY (id);


--
-- Name: student_groups student_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_groups
    ADD CONSTRAINT student_groups_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: submission_feedbacks submission_feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedbacks
    ADD CONSTRAINT submission_feedbacks_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_assignment_id_milestone_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_milestone_id_version_number_key UNIQUE (assignment_id, milestone_id, version_number);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: system_files system_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_files
    ADD CONSTRAINT system_files_pkey PRIMARY KEY (id);


--
-- Name: thesis_assignments thesis_assignments_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_group_id_key UNIQUE (group_id);


--
-- Name: thesis_assignments thesis_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_pkey PRIMARY KEY (id);


--
-- Name: thesis_assignments thesis_assignments_topic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_topic_id_key UNIQUE (topic_id);


--
-- Name: timeline_overrides timeline_overrides_milestone_id_target_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_overrides
    ADD CONSTRAINT timeline_overrides_milestone_id_target_user_id_key UNIQUE (milestone_id, target_user_id);


--
-- Name: timeline_overrides timeline_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_overrides
    ADD CONSTRAINT timeline_overrides_pkey PRIMARY KEY (id);


--
-- Name: topic_approval_logs topic_approval_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_approval_logs
    ADD CONSTRAINT topic_approval_logs_pkey PRIMARY KEY (id);


--
-- Name: topic_registrations topic_registrations_group_id_priority_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_group_id_priority_order_key UNIQUE (group_id, priority_order);


--
-- Name: topic_registrations topic_registrations_group_id_topic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_group_id_topic_id_key UNIQUE (group_id, topic_id);


--
-- Name: topic_registrations topic_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_pkey PRIMARY KEY (id);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_code_key UNIQUE (code);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions USING btree (user_id);


--
-- Name: idx_assignments_campaign_sup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_campaign_sup ON public.thesis_assignments USING btree (campaign_id, supervisor_id);


--
-- Name: idx_audit_logs_actor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor_time ON public.audit_logs USING btree (actor_id, created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_table, entity_id);


--
-- Name: idx_notifications_recipient_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient_unread ON public.notifications USING btree (recipient_id, is_read) WHERE (is_read = false);


--
-- Name: idx_registrations_topic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_topic_status ON public.topic_registrations USING btree (topic_id, status);


--
-- Name: idx_submissions_assignment_milestone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_assignment_milestone ON public.submissions USING btree (assignment_id, milestone_id);


--
-- Name: idx_topics_campaign_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_campaign_status ON public.topics USING btree (campaign_id, status);


--
-- Name: idx_topics_supervisor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_supervisor ON public.topics USING btree (supervisor_id);


--
-- Name: user_roles_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_scope_unique ON public.user_roles USING btree (user_id, role_id, faculty_id, department_id, major_id, campaign_id) NULLS NOT DISTINCT;


--
-- Name: users_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_unique ON public.users USING btree (lower((email)::text));


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_user_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_role_id_fkey FOREIGN KEY (user_role_id) REFERENCES public.user_roles(id) ON DELETE CASCADE;


--
-- Name: campaign_eligible_students campaign_eligible_students_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_eligible_students
    ADD CONSTRAINT campaign_eligible_students_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_eligible_students campaign_eligible_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_eligible_students
    ADD CONSTRAINT campaign_eligible_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_eligible_students campaign_eligible_students_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_eligible_students
    ADD CONSTRAINT campaign_eligible_students_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: campaign_milestones campaign_milestones_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_milestones
    ADD CONSTRAINT campaign_milestones_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: campaigns campaigns_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculties(id) ON DELETE RESTRICT;


--
-- Name: campaigns campaigns_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.majors(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT;


--
-- Name: council_members council_members_council_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.council_members
    ADD CONSTRAINT council_members_council_id_fkey FOREIGN KEY (council_id) REFERENCES public.defense_councils(id) ON DELETE CASCADE;


--
-- Name: council_members council_members_lecturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.council_members
    ADD CONSTRAINT council_members_lecturer_id_fkey FOREIGN KEY (lecturer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: defense_councils defense_councils_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_councils
    ADD CONSTRAINT defense_councils_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: defense_councils defense_councils_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_councils
    ADD CONSTRAINT defense_councils_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: defense_schedules defense_schedules_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_schedules
    ADD CONSTRAINT defense_schedules_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.thesis_assignments(id) ON DELETE CASCADE;


--
-- Name: defense_schedules defense_schedules_council_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_schedules
    ADD CONSTRAINT defense_schedules_council_id_fkey FOREIGN KEY (council_id) REFERENCES public.defense_councils(id) ON DELETE CASCADE;


--
-- Name: defense_schedules defense_schedules_minutes_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defense_schedules
    ADD CONSTRAINT defense_schedules_minutes_file_id_fkey FOREIGN KEY (minutes_file_id) REFERENCES public.system_files(id);


--
-- Name: departments departments_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculties(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculties(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.system_files(id) ON DELETE RESTRICT;


--
-- Name: evaluation_scores evaluation_scores_criterion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores
    ADD CONSTRAINT evaluation_scores_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.rubric_criteria(id) ON DELETE RESTRICT;


--
-- Name: evaluation_scores evaluation_scores_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores
    ADD CONSTRAINT evaluation_scores_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES public.evaluations(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.thesis_assignments(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_evaluator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_evaluator_id_fkey FOREIGN KEY (evaluator_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: evaluations evaluations_rubric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id) ON DELETE RESTRICT;


--
-- Name: evaluations evaluations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exception_requests exception_requests_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: exception_requests exception_requests_evidence_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_evidence_file_id_fkey FOREIGN KEY (evidence_file_id) REFERENCES public.system_files(id);


--
-- Name: exception_requests exception_requests_final_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_final_approver_id_fkey FOREIGN KEY (final_approver_id) REFERENCES public.users(id);


--
-- Name: exception_requests exception_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exception_requests exception_requests_step1_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_requests
    ADD CONSTRAINT exception_requests_step1_approver_id_fkey FOREIGN KEY (step1_approver_id) REFERENCES public.users(id);


--
-- Name: final_grades final_grades_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.thesis_assignments(id) ON DELETE SET NULL;


--
-- Name: final_grades final_grades_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: final_grades final_grades_placement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_placement_id_fkey FOREIGN KEY (placement_id) REFERENCES public.internship_placements(id) ON DELETE SET NULL;


--
-- Name: final_grades final_grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_grades
    ADD CONSTRAINT final_grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_files fk_files_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_files
    ADD CONSTRAINT fk_files_user FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: grade_appeals grade_appeals_final_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_appeals
    ADD CONSTRAINT grade_appeals_final_grade_id_fkey FOREIGN KEY (final_grade_id) REFERENCES public.final_grades(id) ON DELETE CASCADE;


--
-- Name: grade_appeals grade_appeals_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_appeals
    ADD CONSTRAINT grade_appeals_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id);


--
-- Name: grade_appeals grade_appeals_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_appeals
    ADD CONSTRAINT grade_appeals_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.student_groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: internship_evaluations internship_evaluations_placement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_evaluations
    ADD CONSTRAINT internship_evaluations_placement_id_fkey FOREIGN KEY (placement_id) REFERENCES public.internship_placements(id) ON DELETE CASCADE;


--
-- Name: internship_evaluations internship_evaluations_stamped_evaluation_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_evaluations
    ADD CONSTRAINT internship_evaluations_stamped_evaluation_file_id_fkey FOREIGN KEY (stamped_evaluation_file_id) REFERENCES public.system_files(id);


--
-- Name: internship_placements internship_placements_acceptance_letter_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_acceptance_letter_file_id_fkey FOREIGN KEY (acceptance_letter_file_id) REFERENCES public.system_files(id);


--
-- Name: internship_placements internship_placements_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: internship_placements internship_placements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: internship_placements internship_placements_company_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_company_mentor_id_fkey FOREIGN KEY (company_mentor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: internship_placements internship_placements_introduction_letter_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_introduction_letter_file_id_fkey FOREIGN KEY (introduction_letter_file_id) REFERENCES public.system_files(id);


--
-- Name: internship_placements internship_placements_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.internship_positions(id) ON DELETE SET NULL;


--
-- Name: internship_placements internship_placements_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: internship_placements internship_placements_supervisor_lecturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_placements
    ADD CONSTRAINT internship_placements_supervisor_lecturer_id_fkey FOREIGN KEY (supervisor_lecturer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: internship_positions internship_positions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_positions
    ADD CONSTRAINT internship_positions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: internship_positions internship_positions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_positions
    ADD CONSTRAINT internship_positions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: internship_weekly_logs internship_weekly_logs_placement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internship_weekly_logs
    ADD CONSTRAINT internship_weekly_logs_placement_id_fkey FOREIGN KEY (placement_id) REFERENCES public.internship_placements(id) ON DELETE CASCADE;


--
-- Name: lecturer_profiles lecturer_profiles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_profiles
    ADD CONSTRAINT lecturer_profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: lecturer_profiles lecturer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_profiles
    ADD CONSTRAINT lecturer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lecturer_quotas lecturer_quotas_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_quotas
    ADD CONSTRAINT lecturer_quotas_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: lecturer_quotas lecturer_quotas_lecturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lecturer_quotas
    ADD CONSTRAINT lecturer_quotas_lecturer_id_fkey FOREIGN KEY (lecturer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: majors majors_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majors
    ADD CONSTRAINT majors_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: meeting_logs meeting_logs_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_logs
    ADD CONSTRAINT meeting_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.thesis_assignments(id) ON DELETE CASCADE;


--
-- Name: meeting_logs meeting_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_logs
    ADD CONSTRAINT meeting_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: mentor_profiles mentor_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_profiles
    ADD CONSTRAINT mentor_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: mentor_profiles mentor_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_profiles
    ADD CONSTRAINT mentor_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rubric_criteria rubric_criteria_rubric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_criteria
    ADD CONSTRAINT rubric_criteria_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id) ON DELETE CASCADE;


--
-- Name: rubrics rubrics_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubrics
    ADD CONSTRAINT rubrics_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: semesters semesters_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE;


--
-- Name: specializations specializations_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specializations
    ADD CONSTRAINT specializations_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.majors(id);


--
-- Name: student_groups student_groups_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_groups
    ADD CONSTRAINT student_groups_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: student_groups student_groups_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_groups
    ADD CONSTRAINT student_groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.users(id);


--
-- Name: student_profiles student_profiles_cv_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_cv_file_id_fkey FOREIGN KEY (cv_file_id) REFERENCES public.system_files(id) ON DELETE SET NULL;


--
-- Name: student_profiles student_profiles_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.majors(id) ON DELETE RESTRICT;


--
-- Name: student_profiles student_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: submission_feedbacks submission_feedbacks_attachment_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedbacks
    ADD CONSTRAINT submission_feedbacks_attachment_file_id_fkey FOREIGN KEY (attachment_file_id) REFERENCES public.system_files(id) ON DELETE SET NULL;


--
-- Name: submission_feedbacks submission_feedbacks_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedbacks
    ADD CONSTRAINT submission_feedbacks_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: submission_feedbacks submission_feedbacks_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedbacks
    ADD CONSTRAINT submission_feedbacks_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.thesis_assignments(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.campaign_milestones(id) ON DELETE RESTRICT;


--
-- Name: submissions submissions_report_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_report_file_id_fkey FOREIGN KEY (report_file_id) REFERENCES public.system_files(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: thesis_assignments thesis_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: thesis_assignments thesis_assignments_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: thesis_assignments thesis_assignments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.student_groups(id) ON DELETE RESTRICT;


--
-- Name: thesis_assignments thesis_assignments_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: thesis_assignments thesis_assignments_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: thesis_assignments thesis_assignments_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thesis_assignments
    ADD CONSTRAINT thesis_assignments_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE RESTRICT;


--
-- Name: timeline_overrides timeline_overrides_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_overrides
    ADD CONSTRAINT timeline_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: timeline_overrides timeline_overrides_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_overrides
    ADD CONSTRAINT timeline_overrides_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.campaign_milestones(id) ON DELETE CASCADE;


--
-- Name: timeline_overrides timeline_overrides_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_overrides
    ADD CONSTRAINT timeline_overrides_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: topic_approval_logs topic_approval_logs_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_approval_logs
    ADD CONSTRAINT topic_approval_logs_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- Name: topic_approval_logs topic_approval_logs_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_approval_logs
    ADD CONSTRAINT topic_approval_logs_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topic_registrations topic_registrations_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: topic_registrations topic_registrations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.student_groups(id) ON DELETE CASCADE;


--
-- Name: topic_registrations topic_registrations_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_registrations
    ADD CONSTRAINT topic_registrations_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: topics topics_attachment_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_attachment_file_id_fkey FOREIGN KEY (attachment_file_id) REFERENCES public.system_files(id) ON DELETE SET NULL;


--
-- Name: topics topics_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: topics topics_co_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_co_supervisor_id_fkey FOREIGN KEY (co_supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: topics topics_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: topics topics_most_similar_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_most_similar_topic_id_fkey FOREIGN KEY (most_similar_topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;


--
-- Name: topics topics_proposed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_proposed_by_id_fkey FOREIGN KEY (proposed_by_id) REFERENCES public.users(id);


--
-- Name: topics topics_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


--
-- Name: user_roles user_roles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculties(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.majors(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_avatar_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_avatar_file_id_fkey FOREIGN KEY (avatar_file_id) REFERENCES public.system_files(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict mfqHbghmtfx8Xm5a4lkd2AfFCHLhTH11I88oXdhjuwJckUHyziLBcW2juonOhXd

