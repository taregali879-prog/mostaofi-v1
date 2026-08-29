import test from 'node:test';
import assert from 'node:assert/strict';

const contractorTransitions = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW','REJECTED'],
  UNDER_REVIEW: ['TRIAL','APPROVED','REJECTED'],
  TRIAL: ['APPROVED','SUSPENDED','REJECTED'],
  APPROVED: ['SUSPENDED'],
  SUSPENDED: ['APPROVED','REJECTED'],
  REJECTED: ['DRAFT'],
};
function canTransition(from,to){return contractorTransitions[from]?.includes(to) ?? false;}
function canReadProject(userOrg, projectOrg){return userOrg === projectOrg;}

test('contractor draft may be submitted',()=>assert.equal(canTransition('DRAFT','SUBMITTED'),true));
test('contractor draft cannot jump to approved',()=>assert.equal(canTransition('DRAFT','APPROVED'),false));
test('tenant isolation allows same organization',()=>assert.equal(canReadProject('org-a','org-a'),true));
test('tenant isolation rejects different organization',()=>assert.equal(canReadProject('org-a','org-b'),false));
