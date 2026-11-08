INSERT INTO public.roles (code,name) VALUES
('SYSTEM_ADMIN','Quản trị hệ thống'),
('TRAINING_DEPT','Phòng đào tạo'),
('FACULTY_MANAGER','Trưởng khoa'),
('DEPT_HEAD','Trưởng bộ môn'),
('LECTURER','Giảng viên'),
('STUDENT','Sinh viên'),
('ENTERPRISE_MENTOR','Doanh nghiệp / Hướng dẫn thực tập')
ON CONFLICT (code) DO NOTHING;
