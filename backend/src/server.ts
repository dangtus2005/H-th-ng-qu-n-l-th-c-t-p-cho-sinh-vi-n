import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { authenticateJWT, requireRoles } from './middlewares/rbac.middleware';
import * as auth from './controllers/auth.controller';
import * as master from './controllers/master.controller';
import * as accounts from './controllers/accounts.controller';
import * as recovery from './controllers/recovery.controller';
import * as catalog from './controllers/catalog.controller';
import * as excel from './controllers/import.controller';
import * as masterCrud from './controllers/master-crud.controller';
import * as sso from './controllers/sso.controller';
import * as bulk from './controllers/bulk.controller';
import * as profiles from './controllers/profiles.controller';
import * as campaigns from './controllers/campaigns.controller';
import topicWorkflowRouter from './routes/topics.routes';
import * as wishes from './controllers/wishes.controller';
import * as groups from './controllers/groups.controller';
import * as topics from './controllers/topics.controller';
import * as matching from './controllers/matching.controller';
import * as rubrics from './controllers/rubrics.controller';
import * as thesisReports from './controllers/thesis-reports.controller';
import * as internships from './controllers/internships.controller';
import * as results from './controllers/results.controller';
import * as notifications from './controllers/notifications.controller';
import { recoveryLimit } from './middlewares/recovery.middleware';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  if (_req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/v1/auth/sso/providers', sso.providers);
app.get('/api/v1/auth/sso/:provider/callback', sso.callback);
app.get('/api/v1/auth/sso/:provider', sso.begin);
app.post('/api/v1/auth/sso/exchange', sso.exchange);
app.post('/api/v1/auth/login', auth.login);
app.post('/api/v1/auth/forgot-password', recoveryLimit, recovery.forgotPassword);
app.post('/api/v1/auth/reset-password', recoveryLimit, recovery.resetPassword);
app.use('/api/v1', authenticateJWT);
app.use('/api/v1/topic-workflow', topicWorkflowRouter);
app.get('/api/v1/auth/me', auth.getMe);
app.post('/api/v1/auth/logout', auth.logout);
app.post('/api/v1/auth/switch-role', auth.switchRole);
app.post('/api/v1/auth/change-password', auth.changePassword);

const managers = requireRoles(['SYSTEM_ADMIN', 'TRAINING_DEPT']);
const campaignManagers = requireRoles(['SYSTEM_ADMIN', 'TRAINING_DEPT', 'FACULTY_MANAGER']);
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
}).single('file');
app.get('/api/v1/admin/bulk/:kind/template', requireRoles(['SYSTEM_ADMIN']), bulk.bulkTemplate);
app.post('/api/v1/admin/bulk/:kind', requireRoles(['SYSTEM_ADMIN']), excelUpload, bulk.bulkImport);
app.get('/api/v1/profiles/me', profiles.getProfile);
app.put('/api/v1/profiles/me', profiles.saveProfile);
app.get('/api/v1/profiles/me/cv', profiles.viewCV);
app.post('/api/v1/profiles/me/cv', excelUpload, profiles.uploadCV);
app.get('/api/v1/profiles/me/quotas', profiles.quotas);
app.put('/api/v1/profiles/me/quotas/:campaignId', profiles.saveQuota);
app.patch('/api/v1/master-data/campaigns/:id', campaignManagers, campaigns.saveCampaign);
app.delete('/api/v1/master-data/campaigns/:id', campaignManagers, campaigns.deleteCampaign);
app.get('/api/v1/campaigns/eligibility-template', campaignManagers, campaigns.eligibilityTemplate);
app.get('/api/v1/campaigns/:id/eligibility', campaignManagers, campaigns.listEligibility);
app.post(
  '/api/v1/campaigns/:id/eligibility',
  campaignManagers,
  excelUpload,
  campaigns.importEligibility,
);
app.get('/api/v1/campaigns/:id/timeline', campaigns.timeline);
app.put('/api/v1/campaigns/:id/timeline', campaignManagers, campaigns.saveMilestone);
app.post('/api/v1/campaigns/:id/overrides', campaignManagers, campaigns.grantOverride);
app.delete(
  '/api/v1/campaigns/:id/overrides/:overrideId',
  campaignManagers,
  campaigns.revokeOverride,
);
app.get('/api/v1/campaigns/:id/gate', campaigns.gate);
app.post('/api/v1/campaigns/:id/enroll', campaigns.enroll);
app.get('/api/v1/notifications', notifications.list);
app.patch('/api/v1/notifications/:notificationId', notifications.read);
app.get('/api/v1/campaigns/:id/results', results.list);
app.put('/api/v1/campaigns/:id/results/weights', results.weights);
app.post('/api/v1/campaigns/:id/results/publish', results.publish);
app.post('/api/v1/campaigns/:id/results/appeals', results.appeal);
app.patch('/api/v1/campaigns/:id/results/appeals/:appealId', results.resolve);
app.post('/api/v1/campaigns/:id/results/lock', results.lock);
app.get('/api/v1/campaigns/:id/results/export', results.exportCsv);
app.get('/api/v1/campaigns/:id/results/activity', results.activity);
const reportPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 8000 },
}).single('document');
app.get('/api/v1/campaigns/:id/rubrics', rubrics.list);
app.post('/api/v1/campaigns/:id/rubrics', rubrics.create);
app.put('/api/v1/campaigns/:id/rubrics/:slot', rubrics.bind);
app.get('/api/v1/campaigns/:id/thesis-reports', thesisReports.list);
app.get('/api/v1/campaigns/:id/thesis-reports/assignments/:assignmentId', thesisReports.reports);
app.post(
  '/api/v1/campaigns/:id/thesis-reports/assignments/:assignmentId',
  reportPdf,
  thesisReports.submit,
);
app.get('/api/v1/campaigns/:id/thesis-reports/:submissionId/file', thesisReports.download);
app.post('/api/v1/campaigns/:id/thesis-reports/:submissionId/feedback', thesisReports.feedback);
app.put(
  '/api/v1/campaigns/:id/thesis-reports/:submissionId/grades/:studentId',
  thesisReports.grade,
);
app.get('/api/v1/mentor-campaigns', internships.mentorCampaigns);
app.get('/api/v1/campaigns/:id/internships', internships.list);
app.post('/api/v1/campaigns/:id/internships', reportPdf, internships.apply);
app.post('/api/v1/campaigns/:id/internships/companies', internships.company);
app.patch('/api/v1/campaigns/:id/internships/companies/:companyId', internships.company);
app.post('/api/v1/campaigns/:id/internships/companies/:companyId/mentors', internships.addMentor);
app.get('/api/v1/campaigns/:id/internships/:placementId', internships.detail);
app.patch('/api/v1/campaigns/:id/internships/:placementId', internships.review);
app.get('/api/v1/campaigns/:id/internships/:placementId/evidence', internships.file);
app.put('/api/v1/campaigns/:id/internships/:placementId/logs/:week', internships.log);
app.patch('/api/v1/campaigns/:id/internships/:placementId/logs/:week', internships.reviewLog);
app.post('/api/v1/campaigns/:id/internships/:placementId/reports', reportPdf, internships.report);
app.get('/api/v1/campaigns/:id/internships/:placementId/reports/:reportId/file', internships.file);
app.put('/api/v1/campaigns/:id/internships/:placementId/grade', internships.grade);
app.get('/api/v1/campaigns/:id/groups', groups.list);
app.post('/api/v1/campaigns/:id/groups', groups.create);
app.patch('/api/v1/campaigns/:id/groups/:groupId', groups.edit);
app.post('/api/v1/campaigns/:id/groups/:groupId/invitations', groups.invite);
app.patch('/api/v1/campaigns/:id/groups/:groupId/invitations/me', groups.respond);
const topicFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 9, fieldSize: 32000 },
}).single('document');
app.get('/api/v1/topic-archive', topics.archive);
app.get('/api/v1/campaigns/:id/topics', topics.list);
app.post('/api/v1/campaigns/:id/topics', topicFile, topics.submit);
app.patch('/api/v1/campaigns/:id/topics/:topicId', topicFile, topics.submit);
app.get('/api/v1/campaigns/:id/topics/:topicId/similar', topics.duplicates);
app.get('/api/v1/campaigns/:id/topics/:topicId/document', topics.document);
app.post('/api/v1/campaigns/:id/topics/:topicId/review', topics.review);
app.get('/api/v1/campaigns/:id/wish-groups', wishes.listGroups);
app.get('/api/v1/campaigns/:id/wish-groups/:groupId', wishes.groupResults);
app.post('/api/v1/campaigns/:id/wish-groups/:groupId/registrations', wishes.registerWish);
app.put('/api/v1/campaigns/:id/wish-groups/:groupId/registrations', wishes.replaceWishes);
app.get('/api/v1/campaigns/:id/lecturer-wishes', wishes.lecturerWishes);
app.get('/api/v1/campaigns/:id/matching-runs', matching.list);
app.post('/api/v1/campaigns/:id/matching-runs', matching.preview);
app.get('/api/v1/campaigns/:id/matching-runs/:runId', matching.detail);
app.post('/api/v1/campaigns/:id/matching-runs/:runId/adjust', matching.adjust);
app.post('/api/v1/campaigns/:id/matching-runs/:runId/publish', matching.publish);
app.post('/api/v1/campaigns/:id/matching-offers/expire', matching.expire);
app.patch('/api/v1/campaigns/:id/matching-offers/:offerId', matching.respond);
app.put('/api/v1/campaigns/:id/topics/:topicId/adviser', topics.assignAdviser);
app.put('/api/v1/campaigns/:id/lecturer-wishes/:registrationId/rank', wishes.rankApplicant);
app.post('/api/v1/auth/sso/link', sso.link);
for (const name of [
  'faculties',
  'departments',
  'academic-years',
  'semesters',
  'training-systems',
]) {
  app.patch(`/api/v1/master-data/${name}/:id`, managers, masterCrud.saveMaster);
  app.delete(`/api/v1/master-data/${name}/:id`, managers, masterCrud.deleteMaster);
}
app.get('/api/v1/master-data/training-systems', masterCrud.listTrainingSystems);
app.post('/api/v1/master-data/training-systems', managers, masterCrud.saveMaster);
app.use('/api/v1/admin', requireRoles(['SYSTEM_ADMIN']));
app.get('/api/v1/admin/options', accounts.getOptions);
app.get('/api/v1/admin/users', accounts.listUsers);
app.post('/api/v1/admin/users', accounts.createUser);
app.patch('/api/v1/admin/users/:id', accounts.updateUser);
app.post('/api/v1/admin/users/:id/recovery', recovery.issueRecovery);
app.get('/api/v1/admin/users-import-template', excel.importTemplate);
app.post(
  '/api/v1/admin/users-import',
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  }).single('file'),
  excel.importUsers,
);
app.get('/api/v1/admin/audit', accounts.listAudit);
app.get('/api/v1/master-data/majors', catalog.listMajors);
app.post('/api/v1/master-data/majors', managers, catalog.saveMajor);
app.patch('/api/v1/master-data/majors/:id', managers, catalog.saveMajor);
app.delete('/api/v1/master-data/majors/:id', managers, catalog.deleteCatalog);
app.get('/api/v1/master-data/specializations', catalog.listSpecializations);
app.post('/api/v1/master-data/specializations', managers, catalog.saveSpecialization);
app.patch('/api/v1/master-data/specializations/:id', managers, catalog.saveSpecialization);
app.delete('/api/v1/master-data/specializations/:id', managers, catalog.deleteCatalog);
app.get('/api/v1/master-data/campaigns', catalog.listCampaigns);
app.post('/api/v1/master-data/campaigns', campaignManagers, catalog.createCampaign);
app.get('/api/v1/master-data/faculties', master.getFaculties);
app.post('/api/v1/master-data/faculties', managers, master.createFaculty);
app.get('/api/v1/master-data/departments', master.getDepartments);
app.post('/api/v1/master-data/departments', managers, master.createDepartment);
app.get('/api/v1/master-data/academic-years', master.getAcademicYears);
app.post('/api/v1/master-data/academic-years', managers, master.createAcademicYear);
app.get('/api/v1/master-data/semesters', master.getSemesters);
app.post('/api/v1/master-data/semesters', managers, master.createSemester);
app.get('/api/v1/master-data/document-templates', master.getDocumentTemplates);
app.get('/api/v1/master-data/document-templates/:id/download', master.downloadDocumentTemplate);
app.post(
  '/api/v1/master-data/document-templates',
  requireRoles(['SYSTEM_ADMIN', 'TRAINING_DEPT', 'FACULTY_MANAGER']),
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, fieldSize: 4096 },
  }).single('file'),
  master.uploadDocumentTemplate,
);
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API không tồn tại' });
});
app.use(express.static(path.resolve(__dirname, '../../frontend')));
const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'File vượt giới hạn: Excel 5 MB, biểu mẫu 10 MB'
          : 'Dữ liệu tải lên không hợp lệ',
    });
    return;
  }
  const status = [400, 403, 404, 409, 413].includes(error.status)
    ? error.status
    : error.type === 'entity.parse.failed'
      ? 400
      : error.code === '23505'
        ? 409
        : ['23503', '23514', '22001', '22P02', '22007', '22008'].includes(error.code)
          ? 400
          : error.code === 'ENOENT'
            ? 404
            : 500;
  if (status === 500) {
    console.error('Request error:', error);
  }
  res.status(status).json({
    message:
      status === 413
        ? 'Dữ liệu yêu cầu quá lớn'
        : status === 409
          ? error.status === 409
            ? error.message
            : 'Mã hoặc dữ liệu đã tồn tại'
          : status === 404
            ? error.status === 404
              ? error.message
              : 'Không tìm thấy file'
            : status === 403
              ? error.message
              : status === 400
                ? error.status === 400 && error.type !== 'entity.parse.failed'
                  ? error.message
                  : 'Dữ liệu không hợp lệ hoặc bản ghi liên quan không tồn tại'
                : 'Không thể xử lý yêu cầu lúc này',
  });
};
app.use(errorHandler);

if (require.main === module) {
  const port = process.env.PORT || 8000;
  app.listen(port, () => console.log(`Ứng dụng đang chạy tại http://localhost:${port}`));
}
