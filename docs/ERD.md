# ERD toàn bộ hệ thống QLTH

Sinh từ cấu trúc PostgreSQL đang dùng. Các đường nối mô tả khóa ngoại; tính bắt buộc/nullable xem schema SQL.

```mermaid
erDiagram
  academic_years {
    uuid id PK
    character_varying code
    integer start_year
    integer end_year
  }
  audit_logs {
    bigint id PK
    uuid actor_id FK
    character_varying actor_role
    character_varying action
    character_varying entity_table
    uuid entity_id
    jsonb old_values
    jsonb new_values
    text reason
    character_varying ip_address
    text user_agent
    timestamp_with_time_zone created_at
  }
  auth_sessions {
    uuid id PK
    uuid user_id FK
    uuid user_role_id FK
    timestamp_with_time_zone expires_at
    timestamp_with_time_zone created_at
  }
  campaign_eligible_students {
    uuid id PK
    uuid campaign_id FK
    uuid student_id FK
    USER_DEFINED status
    text ineligible_reason
    uuid verified_by FK
    timestamp_with_time_zone created_at
  }
  campaign_milestones {
    uuid id PK
    uuid campaign_id FK
    USER_DEFINED phase
    character_varying title
    text description
    timestamp_with_time_zone start_at
    timestamp_with_time_zone end_at
    timestamp_with_time_zone hard_deadline_at
    boolean is_mandatory
    boolean is_locked_override
    integer sequence_order
  }
  campaigns {
    uuid id PK
    uuid semester_id FK
    uuid faculty_id FK
    uuid major_id FK
    character_varying code
    character_varying name
    USER_DEFINED type
    USER_DEFINED status
    integer min_credits_required
    numeric min_gpa_required
    integer max_students_per_topic
    integer max_wish_choices
    boolean allow_student_propose_topic
    boolean allow_self_find_company
    uuid created_by FK
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  companies {
    uuid id PK
    character_varying tax_code
    character_varying name
    character_varying industry
    text address
    character_varying website
    character_varying contact_email
    character_varying contact_phone
    boolean is_verified
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  council_members {
    uuid id PK
    uuid council_id FK
    uuid lecturer_id FK
    USER_DEFINED position
  }
  defense_councils {
    uuid id PK
    uuid campaign_id FK
    uuid department_id FK
    character_varying code
    character_varying name
    character_varying room
    date defense_date
    time_without_time_zone start_time
    time_without_time_zone end_time
    timestamp_with_time_zone created_at
  }
  defense_schedules {
    uuid id PK
    uuid council_id FK
    uuid assignment_id FK
    integer presentation_order
    timestamp_with_time_zone start_time
    timestamp_with_time_zone end_time
    text meeting_minutes_qa
    uuid minutes_file_id FK
    boolean post_defense_revision_required
    text revision_notes
    boolean is_revision_approved
  }
  departments {
    uuid id PK
    uuid faculty_id FK
    character_varying code
    character_varying name
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  document_templates {
    uuid id PK
    uuid faculty_id FK
    character_varying code
    character_varying name
    uuid file_id FK
    boolean is_active
    timestamp_with_time_zone created_at
  }
  evaluation_scores {
    uuid id PK
    uuid evaluation_id FK
    uuid criterion_id FK
    numeric score
    text comment
  }
  evaluations {
    uuid id PK
    uuid assignment_id FK
    uuid student_id FK
    uuid evaluator_id FK
    uuid rubric_id FK
    USER_DEFINED evaluator_role
    numeric total_score
    text general_comment
    boolean is_submitted
    boolean is_locked
    timestamp_with_time_zone submitted_at
  }
  exception_requests {
    uuid id PK
    uuid campaign_id FK
    uuid requester_id FK
    USER_DEFINED type
    text reason
    uuid evidence_file_id FK
    jsonb payload_data
    USER_DEFINED status
    uuid step1_approver_id FK
    text step1_comment
    timestamp_with_time_zone step1_at
    uuid final_approver_id FK
    text final_comment
    timestamp_with_time_zone final_at
    timestamp_with_time_zone created_at
  }
  faculties {
    uuid id PK
    character_varying code
    character_varying name
    text description
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  final_grades {
    uuid id PK
    uuid campaign_id FK
    uuid student_id FK
    uuid assignment_id FK
    uuid placement_id FK
    numeric supervisor_score
    numeric reviewer_score
    numeric council_avg_score
    numeric company_score
    numeric final_numeric_score
    character_varying final_letter_grade
    boolean has_large_discrepancy
    boolean is_published
    boolean is_final_locked
    timestamp_with_time_zone updated_at
  }
  grade_appeals {
    uuid id PK
    uuid final_grade_id FK
    uuid student_id FK
    text reason
    numeric old_score
    numeric new_score
    USER_DEFINED status
    uuid handled_by FK
    text resolution_note
    timestamp_with_time_zone created_at
    timestamp_with_time_zone resolved_at
  }
  group_members {
    uuid group_id PK,FK
    uuid student_id PK,FK
    timestamp_with_time_zone joined_at
  }
  internship_evaluations {
    uuid id PK
    uuid placement_id FK
    character_varying magic_token_hash
    timestamp_with_time_zone token_expires_at
    numeric attitude_score
    numeric capacity_score
    numeric result_score
    numeric overall_company_score
    text company_comment
    uuid stamped_evaluation_file_id FK
    character_varying evaluated_by_name
    timestamp_with_time_zone evaluated_at
  }
  internship_placements {
    uuid id PK
    uuid campaign_id FK
    uuid student_id FK
    uuid company_id FK
    uuid position_id FK
    uuid supervisor_lecturer_id FK
    uuid company_mentor_id FK
    USER_DEFINED source
    character_varying job_title
    uuid acceptance_letter_file_id FK
    uuid introduction_letter_file_id FK
    date start_date
    date end_date
    USER_DEFINED status
    text reject_reason
    timestamp_with_time_zone created_at
  }
  internship_positions {
    uuid id PK
    uuid campaign_id FK
    uuid company_id FK
    character_varying title
    text description
    text requirements
    integer slots
    integer filled_slots
    character_varying status
    timestamp_with_time_zone created_at
  }
  internship_weekly_logs {
    uuid id PK
    uuid placement_id FK
    integer week_number
    date start_date
    date end_date
    text tasks_performed
    text results_achieved
    text mentor_feedback
    text lecturer_feedback
    boolean is_confirmed_by_mentor
    timestamp_with_time_zone created_at
  }
  lecturer_profiles {
    uuid user_id PK,FK
    uuid department_id FK
    character_varying academic_degree
    text specialization
    ARRAY research_directions
    integer default_thesis_quota
    integer default_internship_quota
    boolean is_accepting_students
    timestamp_with_time_zone updated_at
  }
  lecturer_quotas {
    uuid id PK
    uuid campaign_id FK
    uuid lecturer_id FK
    integer max_students
    integer max_topics
    integer current_assigned_students
  }
  majors {
    uuid id PK
    uuid department_id FK
    character_varying code
    character_varying name
    character_varying training_system FK
    timestamp_with_time_zone created_at
  }
  meeting_logs {
    uuid id PK
    uuid assignment_id FK
    timestamp_with_time_zone meeting_date
    character_varying location_or_link
    text work_done
    text next_plan
    text issues
    uuid created_by FK
    boolean is_confirmed_by_lecturer
    text lecturer_comment
    timestamp_with_time_zone confirmed_at
  }
  mentor_profiles {
    uuid user_id PK,FK
    uuid company_id FK
    character_varying position
    character_varying expertise_area
    timestamp_with_time_zone updated_at
  }
  notifications {
    uuid id PK
    uuid recipient_id FK
    character_varying title
    text content
    character_varying type
    character_varying reference_type
    uuid reference_id
    text action_url
    boolean is_read
    boolean is_email_sent
    timestamp_with_time_zone read_at
    timestamp_with_time_zone created_at
  }
  password_resets {
    uuid user_id PK,FK
    character token_hash
    timestamp_with_time_zone expires_at
    timestamp_with_time_zone created_at
  }
  roles {
    uuid id PK
    USER_DEFINED code
    character_varying name
    jsonb permissions
  }
  rubric_criteria {
    uuid id PK
    uuid rubric_id FK
    character_varying clo_code
    character_varying title
    text description
    numeric max_score
    numeric weight
    jsonb level_guides
    integer display_order
  }
  rubrics {
    uuid id PK
    uuid campaign_id FK
    character_varying name
    USER_DEFINED target_role
    numeric weight_percentage
    timestamp_with_time_zone created_at
  }
  semesters {
    uuid id PK
    uuid academic_year_id FK
    character_varying code
    character_varying name
    date start_date
    date end_date
    boolean is_current
  }
  specializations {
    uuid id PK
    uuid major_id FK
    character_varying code
    character_varying name
    timestamp_with_time_zone created_at
  }
  student_groups {
    uuid id PK
    uuid campaign_id FK
    character_varying name
    uuid leader_id FK
    timestamp_with_time_zone created_at
  }
  student_profiles {
    uuid user_id PK,FK
    uuid major_id FK
    character_varying cohort
    character_varying class_name
    numeric gpa
    integer accumulated_credits
    ARRAY skills
    text interests
    uuid cv_file_id FK
    text portfolio_url
    timestamp_with_time_zone updated_at
  }
  submission_feedbacks {
    uuid id PK
    uuid submission_id FK
    uuid author_id FK
    text content
    uuid attachment_file_id FK
    boolean is_approved_milestone
    timestamp_with_time_zone created_at
  }
  submissions {
    uuid id PK
    uuid assignment_id FK
    uuid milestone_id FK
    uuid submitted_by FK
    integer version_number
    uuid report_file_id FK
    text source_code_url
    text demo_url
    text description
    boolean is_late
    integer late_minutes
    timestamp_with_time_zone submitted_at
  }
  system_files {
    uuid id PK
    uuid uploaded_by FK
    character_varying original_name
    text file_path
    bigint file_size
    character_varying mime_type
    character_varying checksum
    timestamp_with_time_zone created_at
  }
  thesis_assignments {
    uuid id PK
    uuid campaign_id FK
    uuid group_id FK
    uuid topic_id FK
    uuid supervisor_id FK
    uuid reviewer_id FK
    character_varying assignment_method
    USER_DEFINED status
    text defense_ban_reason
    uuid assigned_by FK
    timestamp_with_time_zone assigned_at
    timestamp_with_time_zone updated_at
  }
  timeline_overrides {
    uuid id PK
    uuid milestone_id FK
    uuid target_user_id FK
    timestamp_with_time_zone extended_until
    text reason
    uuid granted_by FK
    timestamp_with_time_zone created_at
  }
  topic_approval_logs {
    uuid id PK
    uuid topic_id FK
    uuid reviewer_id FK
    USER_DEFINED previous_status
    USER_DEFINED new_status
    text feedback_comment
    timestamp_with_time_zone created_at
  }
  topic_registrations {
    uuid id PK
    uuid campaign_id FK
    uuid group_id FK
    uuid topic_id FK
    integer priority_order
    text student_note
    text lecturer_response_note
    USER_DEFINED status
    timestamp_with_time_zone registered_at
    timestamp_with_time_zone responded_at
  }
  topics {
    uuid id PK
    uuid campaign_id FK
    uuid department_id FK
    uuid supervisor_id FK
    uuid co_supervisor_id FK
    uuid proposed_by_id FK
    USER_DEFINED source
    character_varying code
    character_varying title_vi
    character_varying title_en
    text description
    text objectives
    ARRAY required_skills
    ARRAY technologies
    character_varying research_field
    integer max_students
    uuid attachment_file_id FK
    USER_DEFINED status
    numeric similarity_score
    uuid most_similar_topic_id FK
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  training_systems {
    uuid id PK
    character_varying code
    character_varying name
  }
  user_roles {
    uuid id PK
    uuid user_id FK
    uuid role_id FK
    uuid faculty_id FK
    uuid department_id FK
    boolean is_default
    timestamp_with_time_zone assigned_at
    uuid major_id FK
    uuid campaign_id FK
  }
  users {
    uuid id PK
    character_varying code
    character_varying email
    character_varying password_hash
    character_varying full_name
    character_varying phone
    uuid avatar_file_id FK
    character_varying sso_provider
    character_varying sso_id
    boolean is_active
    timestamp_with_time_zone last_login_at
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
  }
  users ||..o{ audit_logs : "actor_id"
  users ||..o{ auth_sessions : "user_id"
  user_roles ||..o{ auth_sessions : "user_role_id"
  campaigns ||..o{ campaign_eligible_students : "campaign_id"
  users ||..o{ campaign_eligible_students : "student_id"
  users ||..o{ campaign_eligible_students : "verified_by"
  campaigns ||..o{ campaign_milestones : "campaign_id"
  users ||..o{ campaigns : "created_by"
  faculties ||..o{ campaigns : "faculty_id"
  majors ||..o{ campaigns : "major_id"
  semesters ||..o{ campaigns : "semester_id"
  defense_councils ||..o{ council_members : "council_id"
  users ||..o{ council_members : "lecturer_id"
  campaigns ||..o{ defense_councils : "campaign_id"
  departments ||..o{ defense_councils : "department_id"
  thesis_assignments ||..o{ defense_schedules : "assignment_id"
  defense_councils ||..o{ defense_schedules : "council_id"
  system_files ||..o{ defense_schedules : "minutes_file_id"
  faculties ||..o{ departments : "faculty_id"
  faculties ||..o{ document_templates : "faculty_id"
  system_files ||..o{ document_templates : "file_id"
  rubric_criteria ||..o{ evaluation_scores : "criterion_id"
  evaluations ||..o{ evaluation_scores : "evaluation_id"
  thesis_assignments ||..o{ evaluations : "assignment_id"
  users ||..o{ evaluations : "evaluator_id"
  rubrics ||..o{ evaluations : "rubric_id"
  users ||..o{ evaluations : "student_id"
  campaigns ||..o{ exception_requests : "campaign_id"
  system_files ||..o{ exception_requests : "evidence_file_id"
  users ||..o{ exception_requests : "final_approver_id"
  users ||..o{ exception_requests : "requester_id"
  users ||..o{ exception_requests : "step1_approver_id"
  thesis_assignments ||..o{ final_grades : "assignment_id"
  campaigns ||..o{ final_grades : "campaign_id"
  internship_placements ||..o{ final_grades : "placement_id"
  users ||..o{ final_grades : "student_id"
  final_grades ||..o{ grade_appeals : "final_grade_id"
  users ||..o{ grade_appeals : "handled_by"
  users ||..o{ grade_appeals : "student_id"
  student_groups ||..o{ group_members : "group_id"
  users ||..o{ group_members : "student_id"
  internship_placements ||..o{ internship_evaluations : "placement_id"
  system_files ||..o{ internship_evaluations : "stamped_evaluation_file_id"
  system_files ||..o{ internship_placements : "acceptance_letter_file_id"
  campaigns ||..o{ internship_placements : "campaign_id"
  companies ||..o{ internship_placements : "company_id"
  users ||..o{ internship_placements : "company_mentor_id"
  system_files ||..o{ internship_placements : "introduction_letter_file_id"
  internship_positions ||..o{ internship_placements : "position_id"
  users ||..o{ internship_placements : "student_id"
  users ||..o{ internship_placements : "supervisor_lecturer_id"
  campaigns ||..o{ internship_positions : "campaign_id"
  companies ||..o{ internship_positions : "company_id"
  internship_placements ||..o{ internship_weekly_logs : "placement_id"
  departments ||..o{ lecturer_profiles : "department_id"
  users ||..o{ lecturer_profiles : "user_id"
  campaigns ||..o{ lecturer_quotas : "campaign_id"
  users ||..o{ lecturer_quotas : "lecturer_id"
  departments ||..o{ majors : "department_id"
  training_systems ||..o{ majors : "training_system"
  thesis_assignments ||..o{ meeting_logs : "assignment_id"
  users ||..o{ meeting_logs : "created_by"
  companies ||..o{ mentor_profiles : "company_id"
  users ||..o{ mentor_profiles : "user_id"
  users ||..o{ notifications : "recipient_id"
  users ||..o{ password_resets : "user_id"
  rubrics ||..o{ rubric_criteria : "rubric_id"
  campaigns ||..o{ rubrics : "campaign_id"
  academic_years ||..o{ semesters : "academic_year_id"
  majors ||..o{ specializations : "major_id"
  campaigns ||..o{ student_groups : "campaign_id"
  users ||..o{ student_groups : "leader_id"
  system_files ||..o{ student_profiles : "cv_file_id"
  majors ||..o{ student_profiles : "major_id"
  users ||..o{ student_profiles : "user_id"
  system_files ||..o{ submission_feedbacks : "attachment_file_id"
  users ||..o{ submission_feedbacks : "author_id"
  submissions ||..o{ submission_feedbacks : "submission_id"
  thesis_assignments ||..o{ submissions : "assignment_id"
  campaign_milestones ||..o{ submissions : "milestone_id"
  system_files ||..o{ submissions : "report_file_id"
  users ||..o{ submissions : "submitted_by"
  users ||..o{ system_files : "uploaded_by"
  users ||..o{ thesis_assignments : "assigned_by"
  campaigns ||..o{ thesis_assignments : "campaign_id"
  student_groups ||..o{ thesis_assignments : "group_id"
  users ||..o{ thesis_assignments : "reviewer_id"
  users ||..o{ thesis_assignments : "supervisor_id"
  topics ||..o{ thesis_assignments : "topic_id"
  users ||..o{ timeline_overrides : "granted_by"
  campaign_milestones ||..o{ timeline_overrides : "milestone_id"
  users ||..o{ timeline_overrides : "target_user_id"
  users ||..o{ topic_approval_logs : "reviewer_id"
  topics ||..o{ topic_approval_logs : "topic_id"
  campaigns ||..o{ topic_registrations : "campaign_id"
  student_groups ||..o{ topic_registrations : "group_id"
  topics ||..o{ topic_registrations : "topic_id"
  system_files ||..o{ topics : "attachment_file_id"
  campaigns ||..o{ topics : "campaign_id"
  users ||..o{ topics : "co_supervisor_id"
  departments ||..o{ topics : "department_id"
  topics ||..o{ topics : "most_similar_topic_id"
  users ||..o{ topics : "proposed_by_id"
  users ||..o{ topics : "supervisor_id"
  campaigns ||..o{ user_roles : "campaign_id"
  departments ||..o{ user_roles : "department_id"
  faculties ||..o{ user_roles : "faculty_id"
  majors ||..o{ user_roles : "major_id"
  roles ||..o{ user_roles : "role_id"
  users ||..o{ user_roles : "user_id"
  system_files ||..o{ users : "avatar_file_id"
```

Baseline: [schema.sql](../backend/database/schema.sql); bổ sung qua [migrations](../backend/migrations/).
