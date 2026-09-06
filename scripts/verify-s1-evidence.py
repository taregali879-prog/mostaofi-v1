#!/usr/bin/env python3
"""Verify S1 evidence; this is not a signer or a human approval substitute."""
import argparse, hashlib, json, pathlib, re, sys
import yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def evaluate(folder, expected):
    folder=pathlib.Path(folder).resolve(); blockers=[]
    def read(rel): return json.loads((folder/rel).read_text())
    try:
        if not re.fullmatch(r'[0-9a-f]{40}',expected): raise ValueError('invalid expected commit SHA')
        manifest=read('integrity/artifact-manifest.json')
        listed={a['path']:a for a in manifest['artifacts']}
        if len(listed)!=len(manifest['artifacts']): raise ValueError('duplicate manifest paths')
        actual={p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()}-{'integrity/artifact-manifest.json','integrity/artifact-manifest.sha256'}
        if actual!=set(listed): raise ValueError('manifest file inventory mismatch')
        for rel,item in listed.items():
            p=folder/rel
            if p.is_symlink() or not p.resolve().is_relative_to(folder): raise ValueError('unsafe artifact path')
            if sha(p)!=item['sha256'] or p.stat().st_size!=item['sizeBytes']: raise ValueError('artifact digest mismatch: '+rel)
        digest=(folder/'integrity/artifact-manifest.sha256').read_text().split()[0]
        if digest!=sha(folder/'integrity/artifact-manifest.json'): raise ValueError('manifest digest mismatch')
        identity=read('run-identity.json'); decision=read('s1-gate-decision.json')
        for key in ['commitSha','authorizedCommitSha']:
            if identity.get(key)!=expected: blockers.append('IDENTITY_'+key)
        if not identity.get('sourceTreeCleanAtStart'): blockers.append('DIRTY_SOURCE_TREE')
        if decision.get('testedCommitSha')!=expected or decision.get('authorizedCommitSha')!=expected: blockers.append('DECISION_SHA_MISMATCH')
        if decision.get('specSha256')!=sha(ROOT/'spec/s1/openapi.yaml'): blockers.append('SPEC_DIGEST_MISMATCH')
        if decision.get('erdSha256')!=sha(ROOT/'spec/v1.1/Mostaofi-v1.1-Final-ERD-Baseline.md'): blockers.append('ERD_DIGEST_MISMATCH')
        adopted=yaml.safe_load((ROOT/'governance/s1/ci-manifest-r003.yaml').read_text())
        if decision.get('manifestSha256')!=sha(ROOT/'governance/s1/ci-manifest-r003.yaml'): blockers.append('REGISTRY_DIGEST_MISMATCH')
        ids={t['id'] for t in adopted['tests']}
        summary=read('test-summary.json')
        if {t['testId'] for t in summary['tests']}!=ids or len(summary['tests'])!=len(ids): blockers.append('TEST_INVENTORY_MISMATCH')
        for test in adopted['tests']:
            tid=test['id']; result=read('tests/'+tid+'/result.json')
            if result.get('commitSha')!=expected or result.get('runId')!=identity['runId']: blockers.append(tid+':IDENTITY_MISMATCH')
            for kind in ['request','response','log']:
                filename={'request':'request.json','response':'response.json','log':'execution.log'}[kind]
                if result.get(kind+'ArtifactSha256')!=sha(folder/'tests'/tid/filename): blockers.append(tid+':INNER_DIGEST_MISMATCH')
            if result.get('status')!='PASS': blockers.append(tid+':'+str(result.get('status','MISSING')))
            elif result.get('executionAttempt')!='SENT' or not result.get('assertions') or any(a.get('status')!='PASS' for a in result['assertions']): blockers.append(tid+':NO_EXECUTED_ASSERTIONS')
        states={}
        for gate in adopted['governanceGates']:
            gid=gate['id']; result=read('gates/'+gid+'/gate-result.json'); states[gid]=result.get('status','MISSING')
            if states[gid]!='PASS': blockers.append(gid+':'+states[gid])
            if result.get('commitSha')!=expected or result.get('runId')!=identity['runId']: blockers.append(gid+':IDENTITY_MISMATCH')
            if gate.get('coverageStatus')!='COVERED' or not gate['mappedTests'] or set(result.get('mappedTests',[]))!=set(gate['mappedTests']): blockers.append(gid+':COVERAGE_INVALID')
        if set(states)!={f'G{i:02}' for i in range(1,11)}: blockers.append('GATE_INVENTORY_MISMATCH')
        if decision.get('gates')!=states or read('gate-summary.json').get('gates')!=states: blockers.append('GATE_SUMMARY_MISMATCH')
        if decision.get('S1_PASS') is not True: blockers.append('S1_ACCEPTANCE_NOT_PASS')
        integrity='VERIFIED'
    except (OSError,ValueError,KeyError,TypeError,IndexError) as e:
        blockers.append('EVIDENCE_INVALID:'+str(e)); integrity='FAILED'; states={}
    return {'expectedCommitSha':expected,'automatedDecision':'PASS' if not blockers else 'NO-GO','effectiveReleaseDecision':'NO-GO','humanApproval':'PENDING','liveAttestation':'NOT_VERIFIED_BY_THIS_TOOL','evidenceIntegrity':integrity,'gates':states,'blockers':blockers}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder');p.add_argument('sha');a=p.parse_args();r=evaluate(a.folder,a.sha);print(json.dumps(r,ensure_ascii=False,indent=2));sys.exit(0 if r['automatedDecision']=='PASS' else 42)