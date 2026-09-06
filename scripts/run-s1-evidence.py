#!/usr/bin/env python3
import argparse, datetime as dt, hashlib, json, os, pathlib, shutil, subprocess, sys, time
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'governance/s1/ci-manifest-r003.yaml'
SPEC = ROOT / 'spec/s1/openapi.yaml'
ERD = ROOT / 'spec/v1.1/Mostaofi-v1.1-Final-ERD-Baseline.md'
EXPECTED_SPEC_SHA = 'd5ab6757814cf6a7793c43644f480e862a1c6be1b7af309ecb4126df9de25aa7'
EXPECTED_ERD_SHA = 'cd57b2b76fee1b962e0a16991414181ea4743004b3065de2ef0376b0f93d6f31'


def now(): return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p): return sha_bytes(pathlib.Path(p).read_bytes())
def write_json(path, obj):
    path = pathlib.Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
def git(*args):
    r=subprocess.run(['git', *args], cwd=ROOT, text=True, capture_output=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()
def resolve_pointer(doc, ref):
    cur=doc
    for part in ref[2:].split('/'):
        part=part.replace('~1','/').replace('~0','~')
        if isinstance(cur,dict) and part in cur: cur=cur[part]
        else: return False
    return True

def static_openapi_checks():
    checks=[]
    try:
        doc=yaml.safe_load(SPEC.read_text())
        checks.append({'check':'YAML_SYNTAX','status':'PASS'})
    except Exception as e:
        return [{'check':'YAML_SYNTAX','status':'FAIL','detail':str(e)}]
    checks.append({'check':'OPENAPI_VERSION','status':'PASS' if doc.get('openapi')=='3.0.3' else 'FAIL','detail':str(doc.get('openapi'))})
    checks.append({'check':'PATHS_PRESENT','status':'PASS' if isinstance(doc.get('paths'),dict) and doc['paths'] else 'FAIL','detail':f"paths={len(doc.get('paths') or {})}"})
    refs=[]
    def walk(x):
        if isinstance(x,dict):
            for k,v in x.items():
                if k=='$ref' and isinstance(v,str) and v.startswith('#/'): refs.append(v)
                walk(v)
        elif isinstance(x,list):
            for v in x: walk(v)
    walk(doc)
    missing=sorted({r for r in refs if not resolve_pointer(doc,r)})
    checks.append({'check':'INTERNAL_REFS_RESOLVE','status':'PASS' if not missing else 'FAIL','detail':{'refCount':len(refs),'missing':missing[:20]}})
    return checks

def strict_validator(mode, out):
    log=out/'strict-validator-attempt.log'
    if mode=='dry-run-blocked':
        log.write_text('dry-run-blocked: specialized OpenAPI validator intentionally unavailable for deterministic test\n')
        return {'status':'BLOCKED','reason':'STRICT_VALIDATOR_UNAVAILABLE','command':None,'exitCode':None,'logSha256':sha_file(log)}
    redocly=shutil.which('redocly')
    commands=[]
    if redocly:
        commands.append([redocly,'lint',str(SPEC),'--extends','recommended-strict'])
    else:
        commands.append(['npx','--yes','@redocly/cli@1.34.5','lint',str(SPEC),'--extends','recommended-strict'])
    for cmd in commands:
        try:
            r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=30)
            log.write_text('$ '+' '.join(cmd)+'\n\nSTDOUT\n'+r.stdout+'\nSTDERR\n'+r.stderr+f'\nEXIT={r.returncode}\n')
            if r.returncode==0:
                return {'status':'PASS','reason':'STRICT_VALIDATOR_PASS','command':cmd,'exitCode':0,'logSha256':sha_file(log)}
            infra = any(s in (r.stderr+r.stdout) for s in ['EAI_AGAIN','ENETUNREACH','registry.npmjs.org','could not determine executable','not found'])
            return {'status':'BLOCKED' if infra else 'FAIL','reason':'STRICT_VALIDATOR_INFRASTRUCTURE_BLOCKED' if infra else 'STRICT_VALIDATOR_REPORTED_ERRORS','command':cmd,'exitCode':r.returncode,'logSha256':sha_file(log)}
        except subprocess.TimeoutExpired as e:
            log.write_text('$ '+' '.join(cmd)+'\nTIMEOUT after 30 seconds\n'+str(e.stdout or '')+str(e.stderr or ''))
            return {'status':'BLOCKED','reason':'STRICT_VALIDATOR_TIMEOUT_OR_NETWORK_BLOCKED','command':cmd,'exitCode':None,'logSha256':sha_file(log)}
        except FileNotFoundError as e:
            log.write_text(str(e)+'\n')
            return {'status':'BLOCKED','reason':'STRICT_VALIDATOR_UNAVAILABLE','command':cmd,'exitCode':None,'logSha256':sha_file(log)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--output', default='evidence/s1')
    ap.add_argument('--mode', choices=['execute','dry-run-blocked'], default='execute')
    args=ap.parse_args()
    out=pathlib.Path(args.output)
    if not out.is_absolute(): out=ROOT/out
    started=now(); run_id=os.getenv('S1_RUN_ID') or 'MOSTAOFI-S1-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    # Capture source identity before evidence output is mutated. This is the clean-tree preflight evidence.
    rc, head, _=git('rev-parse','HEAD'); rc2, branch, _=git('branch','--show-current'); rc3, status, _=git('status','--porcelain')
    # Never delete historical evidence or arbitrary output directories.
    if out.exists() and any(out.iterdir()): raise ValueError('Output directory must be empty')
    out.mkdir(parents=True, exist_ok=True)
    authorized=os.getenv('S1_AUTHORIZED_COMMIT_SHA') or head
    workflow_sha=git('hash-object','scripts/run-s1-evidence.py')[1]
    manifest=yaml.safe_load(MANIFEST.read_text())
    tests=manifest['tests']; gates=manifest['governanceGates']
    run_identity={'runId':run_id,'repository':os.getenv('GITHUB_REPOSITORY','local/mostaofi'),'branch':branch,'commitSha':head,'authorizedCommitSha':authorized,'workflowSha':os.getenv('GITHUB_WORKFLOW_SHA',workflow_sha),'runnerScriptSha256':sha_file(pathlib.Path(__file__)),'environmentId':os.getenv('S1_ENVIRONMENT_ID','caas-local-no-s1-runtime'),'runnerIdentity':f"{os.getenv('RUNNER_NAME','local')}/python-{sys.version.split()[0]}",'startedAtUtc':started,'sourceTreeCleanAtStart':status==''}
    write_json(out/'run-identity.json',run_identity)
    static=static_openapi_checks()
    strict=strict_validator(args.mode,out)
    spec_sha=sha_file(SPEC); erd_sha=sha_file(ERD); manifest_sha=sha_file(MANIFEST)
    g01_checks={
      'headMatchesAuthorized': head==authorized,
      'treeCleanAtStart': status=='',
      'specDigestVerified': spec_sha==EXPECTED_SPEC_SHA,
      'erdDigestVerified': erd_sha==EXPECTED_ERD_SHA,
      'manifestDigest': manifest_sha,
      'staticChecks': static,
      'strictValidator': strict,
    }
    static_pass=all(c['status']=='PASS' for c in static)
    g01_pass=(head==authorized and status=='' and spec_sha==EXPECTED_SPEC_SHA and erd_sha==EXPECTED_ERD_SHA and static_pass and strict['status']=='PASS')
    g01_status='PASS' if g01_pass else ('FAIL' if strict['status']=='FAIL' or head!=authorized or not static_pass or spec_sha!=EXPECTED_SPEC_SHA or erd_sha!=EXPECTED_ERD_SHA else 'BLOCKED')
    runtime_base=os.getenv('S1_BASE_URL')
    runtime={'available':bool(runtime_base),'baseUrl':runtime_base,'s1MaintenanceRuntimeDetected':False,'reason':'S1_BASE_URL_NOT_CONFIGURED' if not runtime_base else 'RUNTIME_EXECUTION_NOT_IMPLEMENTED_BY_THIS_RUNNER'}
    # Source-level check is informational and never substitutes for runtime evidence.
    maintenance_sources=list((ROOT/'apps/api/src').glob('maintenance/**/*')) if (ROOT/'apps/api/src').exists() else []
    runtime['maintenanceSourceFileCount']=len([p for p in maintenance_sources if p.is_file()])
    write_json(out/'runtime-preflight.json',runtime)

    results={}
    for t in tests:
        tid=t['id']; td=out/'tests'/tid; td.mkdir(parents=True,exist_ok=True)
        t0=time.time(); gates_for=t.get('governance',{}).get('gates',[])
        request={'testId':tid,'method':t.get('method'),'path':t.get('path'),'executionAttempt':'NOT_SENT','reason':'UPSTREAM_G01_NOT_PASS' if not g01_pass else 'S1_RUNTIME_NOT_AVAILABLE','headers':{},'body':None}
        response={'testId':tid,'executionAttempt':'NOT_SENT','statusCode':None,'body':None,'reason':request['reason']}
        write_json(td/'request.json',request); write_json(td/'response.json',response)
        log=f"{now()} {tid} BLOCKED: {request['reason']}\nNo HTTP request was fabricated or sent.\n"
        (td/'execution.log').write_text(log)
        req_sha=sha_file(td/'request.json'); res_sha=sha_file(td/'response.json'); log_sha=sha_file(td/'execution.log')
        result={'testId':tid,'gateIds':gates_for,'status':'BLOCKED','reason':request['reason'],'startedAtUtc':started,'finishedAtUtc':now(),'durationMs':int((time.time()-t0)*1000),'runId':run_id,'repository':run_identity['repository'],'branch':branch,'commitSha':head,'workflowSha':workflow_sha,'environmentId':run_identity['environmentId'],'runnerIdentity':run_identity['runnerIdentity'],'requestId':None,'correlationId':None,'traceId':None,'requestArtifact':'request.json','responseArtifact':'response.json','logArtifact':'execution.log','requestArtifactSha256':req_sha,'responseArtifactSha256':res_sha,'logArtifactSha256':log_sha,'assertions':[],'observed':{'expected':t.get('expect')},'executionAttempt':'NOT_SENT','review':{'reviewer':None,'reviewedAtUtc':None,'decision':None,'note':None}}
        write_json(td/'result.json',result)
        sums=[]
        for n in ['request.json','response.json','execution.log','result.json']:
            sums.append(f"{sha_file(td/n)}  {n}")
        (td/'sha256.txt').write_text('\n'.join(sums)+'\n')
        results[tid]=result

    gate_states={}
    for g in gates:
        gid=g['id']; gd=out/'gates'/gid; gd.mkdir(parents=True,exist_ok=True)
        mapped=g['mappedTests']; mapped_results=[{'testId':x,'status':results[x]['status']} for x in mapped]
        if gid=='G01': state=g01_status; reason='G01_REQUIREMENTS_SATISFIED' if state=='PASS' else strict['reason']
        else: state='PASS' if all(results[x]['status']=='PASS' for x in mapped) else 'BLOCKED'; reason='ALL_MAPPED_TESTS_PASS' if state=='PASS' else ('UPSTREAM_G01_NOT_PASS' if not g01_pass else 'MAPPED_TESTS_NOT_PASS')
        gate={'gateId':gid,'name':g['name'],'status':state,'reason':reason,'coverageStatus':g.get('coverageStatus','COVERED'),'mappedTests':mapped,'testResults':mapped_results,'runId':run_id,'commitSha':head,'decidedAtUtc':now()}
        if gid=='G01': gate['checks']=g01_checks
        write_json(gd/'gate-result.json',gate); write_json(gd/'test-index.json',{'gateId':gid,'tests':mapped_results})
        (gd/'sha256.txt').write_text('\n'.join(f"{sha_file(gd/n)}  {n}" for n in ['gate-result.json','test-index.json'])+'\n')
        gate_states[gid]=state

    test_summary={'runId':run_id,'adoptedTestCount':len(tests),'canonicalThrough071DefinedTestCount':sum(int(t['id'].split('-')[-1])<=71 for t in tests),'r002AddedTestCount':sum(int(t['id'].split('-')[-1])>=72 for t in tests),'pass':sum(r['status']=='PASS' for r in results.values()),'fail':sum(r['status']=='FAIL' for r in results.values()),'blocked':sum(r['status']=='BLOCKED' for r in results.values()),'tests':[{'testId':k,'status':v['status'],'reason':v['reason']} for k,v in results.items()]}
    write_json(out/'test-summary.json',test_summary)
    gate_summary={'runId':run_id,'gates':gate_states,'allPass':all(v=='PASS' for v in gate_states.values())}
    write_json(out/'gate-summary.json',gate_summary)
    s1_pass=all(gate_states.get(f'G{i:02d}')=='PASS' for i in range(1,11))
    decision={'runId':run_id,'decisionFormula':'S1_PASS = G01_PASS ∧ G02_PASS ∧ G03_PASS ∧ G04_PASS ∧ G05_PASS ∧ G06_PASS ∧ G07_PASS ∧ G08_PASS ∧ G09_PASS ∧ G10_PASS','S1_PASS':s1_pass,'S2_UNLOCKED':s1_pass,'status':'PASS' if s1_pass else ('FAIL' if any(v=='FAIL' for v in gate_states.values()) else 'BLOCKED'),'gates':gate_states,'testedCommitSha':head,'authorizedCommitSha':authorized,'testedCommitEqualsAuthorizedCommit':head==authorized,'specSha256':spec_sha,'erdSha256':erd_sha,'manifestSha256':manifest_sha,'reason':'ALL_GATES_PASS' if s1_pass else 'ONE_OR_MORE_REQUIRED_GATES_NON_PASS','decidedAtUtc':now()}
    write_json(out/'s1-gate-decision.json',decision)
    # integrity manifest excludes itself and digest; generated last
    files=[]
    for p in sorted(out.rglob('*')):
        if p.is_file() and p.relative_to(out).as_posix() not in ['integrity/artifact-manifest.json','integrity/artifact-manifest.sha256']:
            files.append({'path':p.relative_to(out).as_posix(),'sha256':sha_file(p),'sizeBytes':p.stat().st_size})
    integ=out/'integrity'; integ.mkdir(parents=True,exist_ok=True)
    write_json(integ/'artifact-manifest.json',{'runId':run_id,'algorithm':'SHA-256','artifacts':files})
    (integ/'artifact-manifest.sha256').write_text(f"{sha_file(integ/'artifact-manifest.json')}  artifact-manifest.json\n")
    print(json.dumps(decision,ensure_ascii=False))
    return 0 if s1_pass else 2

if __name__=='__main__': sys.exit(main())
