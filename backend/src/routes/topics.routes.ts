import { Router } from 'express';
import { requireRoles } from '../middlewares/rbac.middleware';
import * as topics from '../controllers/topics.controller';

const router = Router();

router.post(
  '/campaigns/:campaignId/topics',
  requireRoles(['LECTURER']),
  topics.submitTopic,
);
router.get(
  '/campaigns/:campaignId/topics/pending',
  requireRoles(['DEPT_HEAD', 'FACULTY_MANAGER', 'TRAINING_DEPT', 'SYSTEM_ADMIN']),
  topics.listPendingTopics,
);
router.patch(
  '/campaigns/:campaignId/topics/:topicId/decision',
  requireRoles(['DEPT_HEAD', 'FACULTY_MANAGER', 'TRAINING_DEPT', 'SYSTEM_ADMIN']),
  topics.decideTopic,
);
router.get('/campaigns/:campaignId/topics', requireRoles(['STUDENT']), topics.listApprovedTopics);

export default router;
