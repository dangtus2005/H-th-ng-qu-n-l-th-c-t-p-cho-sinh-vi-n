import { integer } from './campaign-access';
import { text } from './validation';

type Policy = {
  enforce_min_credits: boolean;
  min_credits_required: number | null;
  prerequisite_note: string | null;
};

type Evidence = { verified_credits: number | null; verified_prerequisite: string | null };

export function eligibilityPolicy(body: Record<string, unknown>, previous?: Policy): Policy {
  const credits = body.min_credits_required;
  return {
    enforce_min_credits:
      credits === undefined ? (previous?.enforce_min_credits ?? false) : credits !== null,
    min_credits_required:
      credits == null
        ? (previous?.min_credits_required ?? 100)
        : integer(credits, 'Số tín chỉ tối thiểu', 0, 1000),
    prerequisite_note:
      body.prerequisite_note === undefined
        ? (previous?.prerequisite_note ?? null)
        : body.prerequisite_note === null || body.prerequisite_note === ''
          ? null
          : text(body.prerequisite_note, 'Điều kiện tiên quyết', 2000),
  };
}

export function eligibilityReason(policy: Policy, evidence: Evidence) {
  if (
    policy.enforce_min_credits &&
    (evidence.verified_credits === null || evidence.verified_credits < policy.min_credits_required!)
  ) {
    return `Chưa xác minh đủ ${policy.min_credits_required} tín chỉ`;
  }
  if (policy.prerequisite_note && evidence.verified_prerequisite !== policy.prerequisite_note) {
    return 'Chưa xác minh đạt điều kiện tiên quyết của đợt';
  }
  return null;
}
