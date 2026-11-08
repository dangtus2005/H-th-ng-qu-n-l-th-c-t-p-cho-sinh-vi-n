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
